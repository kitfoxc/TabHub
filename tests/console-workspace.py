"""Run with Playwright Chromium. Set CHROMIUM to use an existing installation."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.getenv("CHROMIUM"), args=["--disable-gpu"])
    ctx = browser.new_context(viewport={"width":1440,"height":900})
    dock, hub, other = [ctx.new_page() for _ in range(3)]
    errors = []
    for page in (dock,hub,other):
        page.on("pageerror",lambda e:errors.append(str(e)))
    hub.goto((root/"hub.html").as_uri()+"?hub=main")
    other.goto((root/"hub.html").as_uri()+"?hub=side")
    dock.goto((root/"console.html").as_uri())
    dock.wait_for_function("peers.size===2")
    dock.locator("#hub-card-side").click()
    dock.locator("#message").fill("测试直播公告")
    dock.locator("[data-view=draft]").click()
    dock.frame_locator("#viewport iframe").locator(".active .label").filter(has_text="测试直播公告").wait_for()
    assert dock.evaluate("peers.size===2")
    assert other.evaluate("!document.body.textContent.includes('测试直播公告')")
    dock.locator("#send").click()
    dock.locator("[data-view=live]").click()
    dock.locator("#instances").get_by_text("测试直播公告",exact=True).wait_for()
    assert not hub.evaluate("document.body.textContent.includes('测试直播公告')")
    assert not dock.locator("#viewport iframe").count()
    dock.locator("[data-command=toggle]").click()
    dock.wait_for_function("document.querySelector('#instances').textContent.includes('已暂停')")
    dock.locator("[data-page=preferences]").click()
    dock.locator("[data-group=界面主题]").click()
    dock.locator("[name=themeId]").select_option("cards")
    other.wait_for_function("activeTheme==='cards'")
    dock.locator("[data-page=cast]").click()
    dock.locator("#scope").select_option("selected")
    dock.locator("#recipients").get_by_label("main",exact=False).check()
    assert dock.locator("#targets").inner_text()=="main"
    dock.locator("[data-command=clear]").click()
    hub.wait_for_function("strip.size===0")
    dock.locator("#right-toggle").click()
    dock.reload()
    assert not dock.locator("#inspector").is_visible()
    for width in (900,390,320):
        dock.set_viewport_size({"width":width,"height":560})
        dock.locator("#right-toggle").click()
        assert dock.locator("#inspector").is_visible()
        dock.locator("[data-close=inspector]").click()
        assert dock.evaluate("document.documentElement.scrollWidth <= innerWidth")
        dock.locator(".center").evaluate("e=>e.scrollTop=e.scrollHeight")
        for selector in ("#send","[data-command=toggle]","[data-command=next]"):
            box=dock.locator(selector).bounding_box()
            assert box and 0<=box["y"]<560-box["height"],(width,selector,box)
    assert not errors,errors
    browser.close()
    print("Hub selection, scoped commands, playback reports, isolated draft, preferences and dock breakpoints passed.")
