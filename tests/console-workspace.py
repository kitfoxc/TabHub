"""Exercise the offline broadcast dock with real Hub pages and BroadcastChannel."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.getenv("CHROMIUM"), args=["--disable-gpu"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    dock, hub, side, mirror = [ctx.new_page() for _ in range(4)]
    errors = []
    for page in (dock, hub, side, mirror):
        page.on("pageerror", lambda error: errors.append(str(error)))
    for page, name in ((hub, "main"), (side, "side"), (mirror, "side")):
        page.goto((root / "hub.html").as_uri() + "?hub=" + name)
        page.evaluate("setPaused(true)")
    dock.route("**/messages.js", lambda route: route.fulfill(content_type="text/javascript", body="""
        const tabHubMessages=['plain',{type:'queue',content:[['rich ',{text:'leaf',style:{bold:true}}]]},
          {type:'pack',conditions:{condition:'random_chance',chance:0},content:['blocked']},
          {type:'pack',content:['eligible']}];
    """))
    dock.goto((root / "console.html").as_uri())
    dock.wait_for_function("peers.size===3")
    assert not dock.locator("#library").evaluate("e=>e.open")
    assert not dock.locator("iframe,#inspector,#save-messages,#add-entry").count()
    dock.locator("#hub-card-side").click()
    dock.locator("#message").fill("实时广播")
    dock.locator("#send").click()
    dock.wait_for_function("document.querySelector('[data-operation]').dataset.status==='success'")
    assert dock.locator("[data-operation]").count() == 1
    assert dock.locator("[data-operation] li").count() == 2
    assert not hub.evaluate("document.body.textContent.includes('实时广播')")
    for p in [side,mirror]:
        p.wait_for_function("document.querySelector('.active .label').textContent==='实时广播'")

    dock.locator("#library > summary").click()
    dock.locator("#search").fill("blocked")
    assert dock.locator("#empty-library").is_visible()
    dock.locator("#search").fill("rich")
    saved = side.evaluate("JSON.stringify([source.weights,source.last,source.queue])")
    dock.locator("#entries button:visible").click()
    side.wait_for_function("document.querySelector('.active .echo-text-bold')?.textContent==='leaf'")
    assert side.evaluate("JSON.stringify([source.weights,source.last,source.queue])") == saved
    assert dock.locator("#message").input_value() == "实时广播"
    dock.locator("#search").fill("eligible")
    dock.locator("#entries button:visible").click()
    mirror.wait_for_function("document.querySelector('.active .label').textContent==='eligible'")

    dock.locator("#hub-tools > summary").click()
    dock.locator("#hub-id").fill("offline")
    dock.locator("#add-hub button").click()
    dock.locator("#scope").select_option("selected")
    for name in ["side", "offline"]:
        dock.locator("#recipients").get_by_label(name,exact=False).check()
    dock.locator("#hub-card-main").click()
    assert "main" not in dock.locator("#targets").inner_text()
    count = dock.locator("[data-operation]").count()
    dock.locator("[data-command=toggle]").click()
    dock.wait_for_function("document.querySelector('[data-operation]').dataset.status==='partial'")
    assert dock.locator("[data-operation]").count() == count+1
    row = dock.locator("[data-operation]").first
    assert row.locator("li").count() == 3 and "离线，未发送" in row.text_content()
    dock.locator("#hub-card-side").click()
    dock.locator("[data-page=logs]").click()
    assert dock.locator("#instances article").count() == 2
    assert "Hub 回报于" in dock.locator("#instances").inner_text()
    dock.locator("[data-page=preferences]").click()
    dock.locator("[data-group=主题与外观]").click()
    dock.locator("[name=themeId]").select_option("cards")
    side.wait_for_function("activeTheme==='cards'")
    dock.locator("[data-group=配置管理]").click()
    assert dock.locator("#import-config").is_visible() and dock.locator("#save-config").is_visible()
    dock.locator("#hub-card-offline").click()
    dock.once("dialog", lambda dialog: dialog.accept())
    dock.locator("#remove-hub").click()
    assert not dock.locator("#hub-card-offline").count()
    dock.locator("[data-page=cast]").click()
    # Ignore one request until timeout; verify overlapping operations update their own rows.
    dock.locator("#scope").select_option("current")
    dock.locator("#hub-card-main").click()
    hub.evaluate("() => { const real = executePacket; executePacket = p => p.type==='next' ? undefined : real(p); }")
    dock.locator("[data-command=next]").click()
    previous_id = dock.locator("[data-operation]").first.get_attribute("data-operation")
    dock.locator("[data-command=clear]").click()
    dock.wait_for_function("document.querySelector('[data-operation]').dataset.status==='success'")
    dock.locator(f'[data-operation="{previous_id}"][data-status=timeout]').wait_for(state="attached")
    assert "已清空公告" in dock.locator("#delivery").inner_text()
    # Older receivers can still receive plain library entries.
    dock.evaluate("for(const p of peers.values())if(p.hub==='main')p.supportsEntry=false")
    dock.locator("#search").fill("plain")
    dock.locator("#entries button:visible").click()
    hub.wait_for_function("document.querySelector('.active .label')?.textContent==='plain'")

    for width in [900,390,320]:
        dock.set_viewport_size({"width":width,"height":560})
        assert dock.evaluate("document.documentElement.scrollWidth <= innerWidth")
        dock.locator(".center").evaluate("e=>e.scrollTop=e.scrollHeight")
        for selector in ("#send","[data-command=toggle]","[data-command=next]"):
            box=dock.locator(selector).bounding_box()
            assert box and 0<=box["y"]<560-box["height"],(width,selector,box)

    # Global configuration remains accessible after removing every Hub, including live instances.
    dock.set_viewport_size({"width":1200,"height":800})
    while dock.locator(".hub-card").count():
        dock.once("dialog", lambda dialog: dialog.accept())
        dock.locator("#remove-hub").click()
    dock.locator("[data-page=preferences]").click()
    dock.locator("[data-group=配置管理]").click()
    dock.evaluate("() => { window.showSaveFilePicker = undefined; }")
    with dock.expect_download() as download:
        dock.locator("#save-config").click()
    script = Path(download.value.path()).read_text()
    assert json.loads(script.split("=",1)[1].strip().rstrip(";"))["hubs"] == {}
    dock.locator("#config-file").set_input_files({
        "name":"config.json", "mimeType":"application/json",
        "buffer":json.dumps({"version":2,"settings":{},"hubs":{"restored":{}}}).encode()
    })
    dock.wait_for_function("document.querySelector('#hub').value==='restored'")
    assert dock.locator("#hub-card-restored").count() == 1
    assert not errors,errors
    browser.close()
    print("Passed: scoped operations, pending/partial/timeout receipts, rich and grouped entries, snapshots, settings and Dock.")
