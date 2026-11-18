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
    assert page.evaluate("window.__habit.state.time") > 1, "round clock did not run"
    page.screenshot(path=os.path.join(OUT, "desktop.png"))
    return page


def main():
    httpd, url = serve()
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True)
        desktop(browser, url, errors)
        browser.close()
    httpd.shutdown()
    if errors:
        print("CONSOLE ERRORS:\n" + "\n".join(errors))
        sys.exit(1)
    print("SMOKE OK")


if __name__ == "__main__":
    main()
