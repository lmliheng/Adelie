package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.robolectric.Shadows.shadowOf;

import android.content.Context;
import android.content.Intent;
import android.webkit.WebView;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowToast;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;

/**
 * 网页里在内存中生成、再以 `blob:` / `data:` 交出来的文件（导出 CSV、生成截图、下载 canvas）：
 * 这两种地址 WebView 的 DownloadListener 会给，但外壳取不到内容 —— 一个只在页面进程里有效，
 * 一个内容就在地址里。现在前者由页面自己读成 base64 经 JS 桥递回来，后者在原地解开存盘，
 * 都落在 cache/share，交给系统分享面板。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
public class WebBlobDownloadTest {

    private Context ctx;

    @Before
    public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        CacheClean.clear(ctx);
        // FileProvider 的路径缓存跨用例共享，清一下
        try {
            java.lang.reflect.Field cache =
                    androidx.core.content.FileProvider.class.getDeclaredField("sCache");
            cache.setAccessible(true);
            Object map = cache.get(null);
            if (map instanceof java.util.Map) ((java.util.Map<?, ?>) map).clear();
        } catch (Exception ignored) {
        }
    }

    private MainActivity launch() {
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://127.0.0.1:48231";
        Core.ready = true;
        MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        a.findViewById(R.id.splash).setVisibility(android.view.View.GONE);
        while (shadowOf(a).getNextStartedActivity() != null) {
            // onCreate 要通知权限那条，清掉
        }
        return a;
    }

    private String base64(String text) {
        return android.util.Base64.encodeToString(text.getBytes(), android.util.Base64.NO_WRAP);
    }

    private String read(File file) throws Exception {
        InputStream in = new FileInputStream(file);
        try {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), "UTF-8");
        } finally {
            in.close();
        }
    }

    @Test
    public void theShellExposesOneBridgeAndOnlyOne() {
        MainActivity a = launch();
        WebView web = a.findViewById(R.id.web);
        assertNotNull("blob 下载要靠这座桥", shadowOf(web).getJavascriptInterface("AdelieShell"));
        assertNotNull("下载监听也得在", shadowOf(web).getDownloadListener());
    }

    /** blob: 交给页面自己读：注入的脚本要带上地址、文件名、类型，并且叫得动那座桥。 */
    @Test
    public void blobDownloadsAreHandedBackToThePage() {
        MainActivity a = launch();
        a.startBlobDownload("blob:http://127.0.0.1:48231/1234-5678", null, "text/csv");

        String js = shadowOf((WebView) a.findViewById(R.id.web)).getLastEvaluatedJavascript();
        assertNotNull(js);
        assertTrue(js, js.contains("AdelieShell.download"));
        assertTrue(js, js.contains("blob:http://127.0.0.1:48231/1234-5678"));
        assertTrue(js, js.contains("text/csv"));
        assertTrue(js, js.contains("adelie-download.csv"));
        assertEquals(a.getString(R.string.web_download_starting),
                ShadowToast.getTextOfLatestToast());
    }

    /** 文件名里带引号也别把注入的脚本撕开。 */
    @Test
    public void namesAreEscapedIntoTheScript() {
        String js = WebDownload.blobScript("blob:x", "a'b\\c.csv", "text/csv");
        assertTrue(js.contains("'a\\'b\\\\c.csv'"));
        assertFalse("单引号必须转义，否则脚本提前结束", js.contains("'a'b"));
    }

    @Test
    public void dataUrlsAreDecodedInPlace() {
        MainActivity a = launch();
        a.startDataDownload("data:text/plain;base64," + base64("你好, Adelie"), null, null);

        File file = new File(new File(a.getCacheDir(), CacheClean.DIR_SHARE), "adelie-download.txt");
        assertTrue("data: 的内容应该落成文件", file.isFile());
        try {
            assertEquals("你好, Adelie", read(file));
        } catch (Exception e) {
            fail("读不出来：" + e);
        }
        Intent started = shadowOf(a).getNextStartedActivity();
        assertNotNull(started);
        assertEquals(Intent.ACTION_CHOOSER, started.getAction());
    }

    @Test
    public void dataUrlsWithoutBase64ArePercentDecoded() {
        MainActivity a = launch();
        a.startDataDownload("data:text/plain," + android.net.Uri.encode("第一行\n第二行"),
                "attachment; filename=\"note.txt\"", null);

        File file = new File(new File(a.getCacheDir(), CacheClean.DIR_SHARE), "note.txt");
        assertTrue(file.isFile());
        try {
            assertEquals("第一行\n第二行", read(file));
        } catch (Exception e) {
            fail("读不出来：" + e);
        }
    }

    @Test
    public void aBrokenDataUrlFailsCleanly() {
        MainActivity a = launch();
        a.startDataDownload("data:nocomma", null, "text/plain");
        assertEquals(a.getString(R.string.web_download_failed),
                ShadowToast.getTextOfLatestToast());
        assertFalse(new File(a.getCacheDir(), CacheClean.DIR_SHARE).isDirectory()
                && new File(new File(a.getCacheDir(), CacheClean.DIR_SHARE), "adelie-download.txt")
                .exists());
    }

    /** 桥这一侧：base64 落盘到 cache/share，太大直接拒绝。 */
    @Test
    public void theBridgeWritesIntoTheShareFolder() throws Exception {
        MainActivity a = launch();
        File file = a.saveBlobFile("canvas.png", "image/png", base64("png-bytes"), 9_000);
        assertEquals(CacheClean.DIR_SHARE, file.getParentFile().getName());
        assertEquals("png-bytes", read(file));
        // 「png-bytes」正好 9 个字节，也是「临时文件」里算到的数
        assertEquals(9, CacheClean.totalBytes(a));
    }

    @Test
    public void theBridgeRefusesOversizedBlobs() {
        MainActivity a = launch();
        try {
            a.saveBlobFile("huge.bin", "application/octet-stream", base64("x"),
                    WebDownload.MAX_BYTES + 1);
            fail("超过上限应该拒绝");
        } catch (Exception expected) {
            // 正常
        }
    }

    @Test
    public void badBase64IsAnErrorNotAFile() {
        MainActivity a = launch();
        try {
            a.saveBlobFile("x.bin", "application/octet-stream", "!!!!not base64!!!!", 10);
            fail("解不开的 base64 应该抛");
        } catch (Exception expected) {
            // 正常
        }
        assertFalse(new File(new File(a.getCacheDir(), CacheClean.DIR_SHARE), "x.bin").exists());
    }

    @Test
    public void websocketAndOtherSchemesStillFailLoudly() {
        MainActivity a = launch();
        a.startWebDownload("ftp://example.com/a", null, null, null, 0);
        assertEquals(a.getString(R.string.web_download_failed),
                ShadowToast.getTextOfLatestToast());
    }

    @Test
    public void knownContentLengthIsRefusedBeforeStarting() {
        MainActivity a = launch();
        a.startWebDownload("http://127.0.0.1:1/a", null, null, null, WebDownload.MAX_BYTES + 1);
        assertEquals(a.getString(R.string.web_download_too_big),
                ShadowToast.getTextOfLatestToast());
    }
}
