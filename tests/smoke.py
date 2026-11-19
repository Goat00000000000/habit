"""Browser smoke test: serves the repo, loads the game in headless Chrome,
fails on any console or page error, plays 10 s of scripted input, saves screenshots."""
import functools
import http.server
import os
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tests", "out")
os.makedirs(OUT, exist_ok=True)


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a: None
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/index.html"


# Records full screen and orientation-lock requests instead of performing them (headless Chrome cannot).
FS_SPY = """
window.__fs = { requested: 0, lock: null };
Element.prototype.requestFullscreen = function () { window.__fs.requested++; return Promise.resolve(); };
if (screen.orientation) screen.orientation.lock = o => { window.__fs.lock = o; return Promise.resolve(); };
"""


SKIP_LESSON = "if (!localStorage.getItem('habit.save.v1')) localStorage.setItem('habit.save.v1', JSON.stringify({ tutorialDone: true }));"


def open_page(browser, url, errors, lesson=False, **ctx):
    context = browser.new_context(**ctx)
    context.add_init_script(FS_SPY)
    if not lesson:
        context.add_init_script(SKIP_LESSON)
    page = context.new_page()
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)
    page.wait_for_function("window.__habit && window.__habit.state")
    return page


def desktop(browser, url, errors):
    page = open_page(browser, url, errors, viewport={"width": 1280, "height": 720})
    page.mouse.click(640, 360)  # start
    page.wait_for_timeout(50)
    assert page.evaluate("window.__fs.requested") == 0, "desktop should not force full screen"
    page.wait_for_timeout(300)
    assert page.evaluate("window.__habit.state.phase") == "round", "click should start the round"
    page.evaluate("window.__habit.debugHit()")
    page.wait_for_timeout(30)
    page.screenshot(path=os.path.join(OUT, "hit.png"))
    assert page.evaluate("window.__habit.state.feel.particles.length") > 0, "a hit should spawn particles"
    # the killing hit plays visible slow-mo before the round ends
    page.evaluate("(() => { const h = window.__habit; h.state.rival.hp = 1; h.debugHit(); })()")
    page.wait_for_timeout(100)
    assert page.evaluate("window.__habit.state.phase") == "round", "round should keep running through the kill slow-mo"
    page.wait_for_function("window.__habit.state.phase === 'roundEnd'", timeout=3000)
    page.evaluate("(() => { const s = window.__habit.state; s.round = 0; s.score = {player: 0, rival: 0}; s.phase = 'title'; })()")
    page.mouse.click(640, 360)
    page.wait_for_timeout(200)
    for i in range(50):  # ~10 s of play
        key = "a" if (i // 5) % 2 else "d"
        page.keyboard.down(key)
        page.mouse.move(640 + 200 * ((i % 3) - 1), 360)
        page.mouse.click(700, 360)
        if i % 7 == 0:
            page.keyboard.press("Space")
        page.wait_for_timeout(200)
        page.keyboard.up(key)
    phase = page.evaluate("window.__habit.state.phase")
    assert phase != "title", f"still on title, phase={phase}"
    assert page.evaluate("window.__habit.state.round >= 2 || window.__habit.state.time > 1"), "round clock did not run"
    page.screenshot(path=os.path.join(OUT, "desktop.png"))
    # keys must work by physical position even when an input tool hides the letter (key='Process')
    page.evaluate("(() => { const s = window.__habit.state; s.phase = 'round'; s.paused = false; s.player.hp = 3; s.time = 1; s.player.x = 480; s.player.y = 270; })()")
    for code, axis, sign in [("KeyA", "vx", -1), ("KeyS", "vy", 1), ("KeyD", "vx", 1), ("KeyW", "vy", -1)]:
        page.evaluate(f"window.dispatchEvent(new KeyboardEvent('keydown', {{key: 'Process', code: '{code}'}}))")
        page.wait_for_timeout(80)
        v = page.evaluate(f"window.__habit.state.player.{axis}")
        page.evaluate(f"window.dispatchEvent(new KeyboardEvent('keyup', {{key: 'Process', code: '{code}'}}))")
        assert v * sign > 0, f"{code} should move the player, {axis}={v}"
    # mouse held while the window loses focus must not keep firing
    page.mouse.down()
    page.evaluate("window.dispatchEvent(new Event('blur'))")
    assert page.evaluate("window.__habit.input.mouseDown") is False, "blur should release the fire button"
    page.mouse.up()
    return page


MOBILE = dict(has_touch=True, is_mobile=True, device_scale_factor=3)


def mobile_landscape(browser, url, errors):
    page = open_page(browser, url, errors, viewport={"width": 844, "height": 390}, **MOBILE)
    box = page.evaluate("(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.width, r.height]; })()")
    assert abs(box[1] - 390) < 2, f"canvas should fill height, got {box}"
    assert not page.evaluate("window.__habit.state.paused"), "landscape should not pause"
    page.touchscreen.tap(422, 195)  # start
    page.wait_for_timeout(300)
    assert page.evaluate("window.__habit.state.phase") == "round", "tap should start the round"
    fs = page.evaluate("window.__fs")
    assert fs["requested"] >= 1, "first tap on a phone should ask for full screen"
    assert fs["lock"] == "landscape", f"full screen should lock landscape, got {fs['lock']}"
    assert page.evaluate("!!document.querySelector('link[rel=manifest]') && document.querySelector('meta[name=apple-mobile-web-app-capable]')?.content === 'yes'"), "home screen app settings missing"
    # left stick: hold a touch and drag right via CDP so the move stick is exercised
    cdp = page.context.new_cdp_session(page)
    def touch(kind, pts):
        cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]})
    touch("touchStart", [(150, 250)])
    for i in range(10):
        touch("touchMove", [(150 + 8 * i, 250)])
        page.wait_for_timeout(30)
    page.wait_for_timeout(400)
    vx = page.evaluate("window.__habit.state.player.vx")
    touch("touchEnd", [])
    assert vx > 0, f"left stick dragged right should move right, vx={vx}"
    # right side: quick swipe = dash
    touch("touchStart", [(650, 200)])
    touch("touchMove", [(560, 200)])
    touch("touchEnd", [])
    page.wait_for_timeout(50)
    assert page.evaluate("window.__habit.state.player.dashCd") > 0, "swipe should dash"
    page.screenshot(path=os.path.join(OUT, "mobile.png"))
    # dash button, bottom right
    page.evaluate("window.__habit.state.player.dashCd = 0")
    bx, by = page.evaluate("(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left + 870 * r.width / 960, r.top + 458 * r.height / 540]; })()")
    touch("touchStart", [(bx, by)])
    touch("touchEnd", [])
    page.wait_for_timeout(50)
    assert page.evaluate("window.__habit.state.player.dashCd") > 0, "dash button should dash"
    # drag-to-aim: a slow up-right drag on the right half must shoot up-right, not auto-aim at the rival
    page.wait_for_timeout(600)
    pin_rival = "(() => { const s = window.__habit.state; s.bullets = s.bullets.filter(b => b.owner !== 'player'); s.player.fireCd = 0; s.player.x = 300; s.player.y = 270; s.rival.x = 500; s.rival.y = 470; })()"
    page.evaluate(pin_rival)
    touch("touchStart", [(650, 200)])
    for i in range(6):
        touch("touchMove", [(650 + 6 * i, 200 - 6 * i)])
        page.wait_for_timeout(40)
    page.evaluate(pin_rival)  # rival below-right, so auto-aim would shoot downward
    touch("touchEnd", [])
    page.wait_for_timeout(50)
    shots = page.evaluate("window.__habit.state.bullets.filter(b => b.owner === 'player').map(b => [b.vx, b.vy])")
    assert shots and shots[0][1] < -100 and shots[0][0] > 100, f"drag up-right should shoot up-right, got {shots}"
    # a touch held through round end must not fire a stray shot when the next round starts
    touch("touchStart", [(650, 200)])
    page.evaluate("window.__habit.debugEndRound()")
    page.wait_for_timeout(100)
    touch("touchEnd", [])
    page.wait_for_function("window.__habit.state.phase === 'report'", timeout=5000)
    page.touchscreen.tap(422, 195)
    page.wait_for_timeout(60)
    stray = page.evaluate("window.__habit.state.bullets.filter(b => b.owner === 'player').length")
    assert stray == 0, f"no stray shot at round start, got {stray}"
    # a tiny stick push plus a keyboard Space must not crash
    page.evaluate("(() => { const i = window.__habit.input; i.stick = {id: 9, ox: 100, oy: 300, x: 109, y: 300}; i.dashPressed = true; window.__habit.state.player.dashCd = 0; })()")
    page.wait_for_timeout(100)
    page.evaluate("window.__habit.input.stick = null")


def mobile_portrait(browser, url, errors):
    page = open_page(browser, url, errors, viewport={"width": 390, "height": 844}, **MOBILE)
    assert page.is_visible("#rotate"), "portrait should show the rotate prompt"
    assert page.evaluate("window.__habit.state.paused"), "portrait should pause"
    page.set_viewport_size({"width": 844, "height": 390})
    page.wait_for_timeout(200)
    assert not page.is_visible("#rotate"), "rotating back should hide the prompt"
    assert not page.evaluate("window.__habit.state.paused"), "rotating back should resume"


def resize(page):
    page.set_viewport_size({"width": 800, "height": 600})
    page.wait_for_timeout(200)
    r = page.evaluate("(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
    a = page.evaluate(f"window.__habit.toArena({r[0]}, {r[1]})")
    assert abs(a["x"] - 480) < 2 and abs(a["y"] - 270) < 2, f"centre should map to arena centre, got {a}"


SEEDED = {
    "model": {"counts": {
        "mid|1|0|0|*": {"dash:W": 10},
        "mid|0|0|0|*": {"move:E": 10},
        "far|0|0|0|*": {"still": 8},
        "all": {"dash:W": 10, "move:E": 10, "still": 8},
    }},
    "rivalLevel": 2, "lastDay": "2020-01-01", "bonusReads": 0, "challengeDone": False, "tutorialDone": True,
}


def returning_player(browser, url, errors):
    import json
    ctx = browser.new_context(viewport={"width": 1280, "height": 720})
    ctx.add_init_script(f"localStorage.setItem('habit.save.v1', {json.dumps(json.dumps(SEEDED))})")
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)
    page.wait_for_function("window.__habit && window.__habit.state")
    ui = page.evaluate("window.__habit.state.ui")
    assert ui["welcome"] and ui["welcome"].startswith("Welcome back. Last time:"), f"welcome line missing: {ui}"
    assert ui["challenge"].startswith("Today: "), f"daily challenge missing: {ui}"
    page.screenshot(path=os.path.join(OUT, "title-returning.png"))
    page.mouse.click(640, 360)
    page.wait_for_timeout(300)
    page.evaluate("window.__habit.debugEndRound()")
    page.wait_for_timeout(1500)
    assert page.evaluate("window.__habit.state.phase") == "report", "round end should lead to the report"
    rep = page.evaluate("window.__habit.state.ui.report")
    assert len(rep["habits"]) == 3, f"report should list 3 habits: {rep}"
    assert rep["predictability"].startswith("Predictability ") and rep["predictability"].endswith("%"), rep
    page.screenshot(path=os.path.join(OUT, "report.png"))
    # In-game read: the seeded "dodges left when shot at" habit should trigger a telegraphed READ by round 3.
    page.evaluate("(() => { const s = window.__habit.state; s.round = 2; s.score = {player: 0, rival: 0}; s.phase = 'title'; })()")
    page.mouse.click(640, 360)
    page.wait_for_timeout(300)
    page.evaluate("(() => { const s = window.__habit.state; s.player.hp = 99; s.rival.hp = 99; })()")
    page.wait_for_function("window.__habit.state.readLabel !== null", timeout=12000)
    label = page.evaluate("window.__habit.state.readLabel.text")
    assert label.startswith("READ: "), label
    page.wait_for_timeout(120)
    page.screenshot(path=os.path.join(OUT, "read.png"))
    # beat the read: clear its bullets as if dodged, then the OUTPLAYED pop shows
    page.wait_for_function("window.__habit.state.activeRead !== null", timeout=3000)
    page.evaluate("(() => { const s = window.__habit.state; s.bullets = s.bullets.filter(b => !b.readId); })()")
    page.wait_for_function("window.__habit.state.outplayed !== null", timeout=2000)
    page.wait_for_timeout(150)
    page.screenshot(path=os.path.join(OUT, "outplayed.png"))
    # lose the level: the run ends and the run-over screen shows the level reached
    page.evaluate("(() => { const s = window.__habit.state; s.player.hp = 0; })()")
    page.wait_for_function("window.__habit.state.phase === 'report'", timeout=4000)
    page.screenshot(path=os.path.join(OUT, "report-loss.png"))
    page.mouse.click(640, 360)
    page.wait_for_function("window.__habit.state.phase === 'runOver'", timeout=2000)
    page.screenshot(path=os.path.join(OUT, "runover.png"))
    # trick pick screen after clearing level 2
    page.evaluate("(() => { const s = window.__habit.state; s.round = 1; s.phase = 'title'; })()")
    page.mouse.click(640, 360)
    page.wait_for_timeout(200)
    page.evaluate("(() => { const s = window.__habit.state; s.rival.hp = 0; })()")
    page.wait_for_function("window.__habit.state.phase === 'report'", timeout=4000)
    page.mouse.click(640, 360)
    page.wait_for_function("window.__habit.state.phase === 'trickPick'", timeout=2000)
    page.wait_for_timeout(400)
    page.screenshot(path=os.path.join(OUT, "trickpick.png"))
    page.keyboard.press("2")
    page.wait_for_function("window.__habit.state.phase === 'round'", timeout=2000)
    assert page.evaluate("window.__habit.state.tricks.join()") == "ricochet", "pressing 2 should pick Ricochet"


def lesson(browser, url, errors):
    page = open_page(browser, url, errors, lesson=True, viewport={"width": 1280, "height": 720})
    page.mouse.click(640, 360)
    page.wait_for_timeout(300)
    assert page.evaluate("window.__habit.state.tutorial.step") == "move", "a first run starts with the lesson"
    page.screenshot(path=os.path.join(OUT, "lesson.png"))
    page.keyboard.press("Enter")
    page.wait_for_timeout(100)
    assert page.evaluate("window.__habit.state.tutorial.step") == "fight", "Enter skips the lesson"


def main():
    httpd, url = serve()
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True)
        page = desktop(browser, url, errors)
        resize(page)
        mobile_landscape(browser, url, errors)
        mobile_portrait(browser, url, errors)
        returning_player(browser, url, errors)
        lesson(browser, url, errors)
        browser.close()
    httpd.shutdown()
    if errors:
        print("CONSOLE ERRORS:\n" + "\n".join(errors))
        sys.exit(1)
    print("SMOKE OK")


if __name__ == "__main__":
    main()
