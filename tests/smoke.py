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


def open_page(browser, url, errors, **ctx):
    page = browser.new_context(**ctx).new_page()
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)
    page.wait_for_function("window.__habit && window.__habit.state")
    return page


def desktop(browser, url, errors):
    page = open_page(browser, url, errors, viewport={"width": 1280, "height": 720})
    page.mouse.click(640, 360)  # start
    page.wait_for_timeout(300)
    assert page.evaluate("window.__habit.state.phase") == "round", "click should start the round"
    page.evaluate("window.__habit.debugHit()")
    page.wait_for_timeout(30)
    page.screenshot(path=os.path.join(OUT, "hit.png"))
    assert page.evaluate("window.__habit.state.feel.particles.length") > 0, "a hit should spawn particles"
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


def main():
    httpd, url = serve()
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True)
        page = desktop(browser, url, errors)
        resize(page)
        mobile_landscape(browser, url, errors)
        mobile_portrait(browser, url, errors)
        browser.close()
    httpd.shutdown()
    if errors:
        print("CONSOLE ERRORS:\n" + "\n".join(errors))
        sys.exit(1)
    print("SMOKE OK")


if __name__ == "__main__":
    main()
