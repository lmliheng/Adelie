package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.DownloadManager;
import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * 检查更新：清单解析是纯逻辑，这里锁住「只认 android-test」「按数字比版本」「坏数据不打扰人」；
 * 下载那半边走系统下载器，单测里看它排进来的请求对不对。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class UpdateCheckTest {

    private static String index(String name, String digest) {
        return "{\n" +
                "  \"versions\": [\n" +
                "    {\"tag\": \"v0.8.5\", \"files\": [{\"name\": \"penguin-linux-x64.tar.gz\"}]},\n" +
                "    {\"tag\": \"android-test\", \"files\": [{\n" +
                "      \"name\": \"" + name + "\",\n" +
                "      \"label\": \"手机版 · Android arm64\",\n" +
                "      \"size\": 101107099,\n" +
                "      \"sha256\": \"" + digest + "\",\n" +
                "      \"url\": \"/downloads/android/" + name + "\"\n" +
                "    }]}\n" +
                "  ]\n" +
                "}";
    }

    @Test
    public void newerBuildIsDetected() {
        UpdateCheck.Release r = UpdateCheck.newer(
                index("adelie-android-arm64-1.0.14-beta.apk", "abc123"), "1.0.13");
        assertNotNull(r);
        assertEquals("1.0.14", r.version);
        assertEquals("adelie-android-arm64-1.0.14-beta.apk", r.file);
        assertEquals("/downloads/android/adelie-android-arm64-1.0.14-beta.apk", r.url);
        assertEquals(101107099L, r.size);
        assertEquals("abc123", r.sha256);
    }

    @Test
    public void sameVersionIsNotAnUpdate() {
        assertNull(UpdateCheck.newer(index("adelie-android-arm64-1.0.13-beta.apk", "x"), "1.0.13"));
    }

    @Test
    public void olderVersionIsNotAnUpdate() {
        assertNull(UpdateCheck.newer(index("adelie-android-arm64-1.0.9-beta.apk", "x"), "1.0.13"));
    }

    @Test
    public void numbersCompareAsNumbersNotStrings() {
        assertTrue("1.0.10 要比 1.0.9 新", UpdateCheck.compare("1.0.10", "1.0.9") > 0);
        assertTrue("1.1.0 要比 1.0.99 新", UpdateCheck.compare("1.1.0", "1.0.99") > 0);
        assertEquals(0, UpdateCheck.compare("1.0.13", "1.0.13-beta"));
        assertTrue(UpdateCheck.compare("1.0.2", "1.0.13") < 0);
    }

    @Test
    public void versionIsTakenFromTheFileName() {
        assertEquals("1.0.14", UpdateCheck.versionOf("adelie-android-arm64-1.0.14-beta.apk"));
        assertEquals("2.3.4", UpdateCheck.versionOf("2.3.4"));
        assertEquals("", UpdateCheck.versionOf("adelie-android-arm64-beta.apk"));
        assertEquals("", UpdateCheck.versionOf(null));
    }

    @Test
    public void garbageDoesNotCount() {
        assertNull(UpdateCheck.newer(null, "1.0.13"));
        assertNull(UpdateCheck.newer("", "1.0.13"));
        assertNull(UpdateCheck.newer("not json", "1.0.13"));
        assertNull(UpdateCheck.newer("{\"versions\": 3}", "1.0.13"));
        assertNull(UpdateCheck.newer(index("adelie-android-arm64-beta.apk", "x"), "1.0.13"));
        assertNull("别的 tag 不算", UpdateCheck.newer(
                "{\"versions\":[{\"tag\":\"v0.8.5\",\"files\":[{\"name\":\"a-9.9.9.apk\","
                        + "\"url\":\"/x\"}]}]}", "1.0.13"));
    }

    @Test
    public void sizesAreHumanReadable() {
        assertEquals("96.4 MiB", UpdateCheck.sizeText(101107099L));
        assertEquals("", UpdateCheck.sizeText(0));
    }

    @Test
    public void downloadGoesToTheSystemDownloader() {
        Context ctx = ApplicationProvider.getApplicationContext();
        UpdateCheck.Release r = UpdateCheck.newer(
                index("adelie-android-arm64-1.0.14-beta.apk", "abc"), "1.0.13");
        assertNotNull(r);

        long id = UpdateCheck.download(ctx, r);
        DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
        assertTrue("下载器返回队号（>=0）：" + id, id >= 0);
        assertEquals(1, shadowOf(dm).getRequestCount());

        // Request 没有公开的 getter，只能确认「确实排进去了、拿到了队号」
        assertNotNull(shadowOf(dm).getRequest(id));
    }

    @Test
    public void relativeUrlsGetTheSitePrefix() {
        assertEquals("http://adelie.lmliheng.work:3003/downloads/android/a.apk",
                UpdateCheck.resolve("/downloads/android/a.apk").toString());
        assertEquals("https://example.com/a.apk",
                UpdateCheck.resolve("https://example.com/a.apk").toString());
    }
}
