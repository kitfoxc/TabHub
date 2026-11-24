"""Run with Python Playwright and Chromium. CHROMIUM may point to an existing executable."""
import os
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as pw, TemporaryDirectory() as tmp:
    browser = pw.chromium.launch(executable_path=os.getenv("CHROMIUM"), args=["--disable-gpu"])
    context = browser.new_context(accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto((ROOT / "messages-editor.html").as_uri())
    page.wait_for_function("typeof doc !== 'undefined' && doc && !document.body.inert")
    def count():
        return page.evaluate("doc.rows.length")

    page.locator("#files").set_input_files(ROOT / "messages.js")
    page.wait_for_function("doc.rows.length === 8")
    page.locator("#text").fill("欢迎来到直播间")
    page.locator("[data-quick-format=italic]").click()
    assert page.evaluate("selected().value.style.italic")
    page.locator("#text").evaluate("e=>e.setSelectionRange(0,2)")
    page.locator("#applyFormat").click()
    assert page.evaluate("selected().value[0].style.bold && selected().value[0].text==='欢迎'")
    page.locator("[data-mode=source]").click()
    page.locator("#raw").fill('{"text":')
    page.wait_for_function("selected().error")
    page.locator("#download").click()
    assert "修正" in page.locator("#status").inner_text()
    page.locator("#raw").fill('{"text":"修改后","future":11}')
    page.locator("[data-mode=mixed]").click()
    page.locator("#theme").select_option("cards")
    frame = page.frame_locator("#frameBox iframe")
    frame.locator(".card .label").filter(has_text="修改后").wait_for()
    page.locator("#scope").select_option("all")
    page.locator("#step").click()
    page.locator("#play").click()
    page.locator("#play").click()
    page.locator("#wikiTab").click()
    assert page.locator("iframe").count()==0
    page.locator("#wikiSearch").fill("字距")
    assert page.locator("#wiki article").count()==1
    page.locator("#wiki article button").last.click()
    with page.expect_download() as download:
        page.locator("#download").click()
    dest=Path(tmp)/"messages.js"
    download.value.save_as(str(dest))
    assert '"future": 11' in dest.read_text()
    page.locator("#newDoc").click()
    page.locator("#add").click()
    page.locator("#text").fill("第二份草稿")
    page.locator("#undo").click()
    assert page.locator("#text").input_value()==""
    page.locator("#redo").click()
    assert page.locator("#text").input_value()=="第二份草稿"
    page.wait_for_timeout(650)
    page.reload()
    page.wait_for_function("document.querySelector('#text').value==='第二份草稿'")
    assert count()==1 and page.locator("#documents button").count()==3
    page.locator("#files").set_input_files({"name":"bad.js","mimeType":"text/javascript","buffer":b"const tabHubMessages=[alert(1)]"})
    page.wait_for_function("document.querySelector('#status').textContent.includes('导入失败')")
    assert count()==1
    # Merge a second file, filter without reordering the document, bulk-delete and undo.
    page.evaluate("window.showOpenFilePicker=undefined")
    with page.expect_file_chooser() as chooser:
        page.locator("#merge").click()
    chooser.value.set_files({"name":"extra.js","mimeType":"text/javascript","buffer":b"const tabHubMessages=['added A','added B']"})
    page.wait_for_function("doc.rows.length===3")
    page.locator("#search").fill("added")
    assert page.locator("#rows .row").count()==2
    page.locator("#checkAll").check()
    page.locator("#remove").click()
    assert count()==1
    page.locator("#undo").click()
    assert count()==3
    page.locator("#search").fill("")
    page.locator("#rows .row button").first.click()
    # Simulate the browser composition event order without replacing the live input.
    page.locator("#text").evaluate("""field=>{
        field.dispatchEvent(new CompositionEvent('compositionstart'));
        field.value='输入法组字';
        field.dispatchEvent(new InputEvent('input',{isComposing:true,bubbles:true}));
        if(selected().value==='输入法组字')throw Error('committed mid-composition');
        field.dispatchEvent(new CompositionEvent('compositionend'));
    }""")
    assert page.evaluate("selected().value==='输入法组字'")
    # Local HTTP deployment, with a real writable file in the origin-private file system.
    class SilentHandler(SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    server = ThreadingHTTPServer(("127.0.0.1",0),partial(SilentHandler,directory=str(ROOT)))
    Thread(target=server.serve_forever,daemon=True).start()
    base = "http://127.0.0.1:"+str(server.server_port)
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base+"/messages-editor.html")
    page.locator("#add").click()
    page.locator("#text").fill("输入法组字")
    page.frame_locator("iframe").locator(".tab.active").wait_for()
    dock = context.new_page()
    dock.goto(base+"/console.html")
    hub = context.new_page()
    # The unmodified Hub message loader consumes the editor's exported JS.
    hub.route("**/messages.js", lambda route: route.fulfill(
        content_type="text/javascript", body=dest.read_text()))
    hub.goto(base+"/hub.html")
    assert hub.evaluate("tabHubMessages[0][0].future===11 && source.entries.length===8")
    dock.wait_for_function("peers.size===1")
    assert page.frames[-1].evaluate("typeof sendPacket==='undefined'")

    page.evaluate("""async()=> {
        const root=await navigator.storage.getDirectory();
        window.testFile=await root.getFileHandle('messages.js',{create:true});
        const stream=await testFile.createWritable();
        await stream.write('prior content');await stream.close();
        doc.handle=testFile;doc.original='prior content';
    }""")
    page.locator("#save").click()
    page.wait_for_function("doc.saved===doc.rows")
    assert "输入法组字" in page.evaluate("async()=>await (await testFile.getFile()).text()")
    page.evaluate("""async()=>{const stream=await testFile.createWritable();await stream.write('external');await stream.close();}""")
    page.locator("#text").fill("新的修改")
    with page.expect_download():
        page.locator("#save").click()
    assert page.evaluate("async()=>await (await testFile.getFile()).text()")=="external"
    assert page.evaluate("doc.saved!==doc.rows")
    assert not errors, errors
    browser.close()
    server.shutdown()
    print("Offline editor, templates, source validation, selection formatting, multi-document drafts and export passed.")
