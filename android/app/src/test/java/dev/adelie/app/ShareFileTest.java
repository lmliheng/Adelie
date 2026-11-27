package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 分享图片 / 文件进来：内容落在 {@code cache/share}（临时文件里看得见、清得掉），
 * 输入框里写一行「[分享的图片] /路径」，用户按下发送，Agent 就能按这个路径去读。
 *
 * <p>内容提供方用影子代替：{@code registerInputStream} 给 uri 配一段字节流，
 * 拷文件的循环、上限、文件名清洗都是真代码。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
public class ShareFileTest {

    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final String BASE = "http://127.0.0.1:48231";

    private MainActivity launch() {
        Core.phase = "服务已就绪";
        Core.baseUrl = BASE;
        Core.ready = true;
        MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        a.findViewById(R.id.splash).setVisibility(android.view.View.GONE);
        while (shadowOf(a).getNextStartedActivity() != null) {
            // 清掉 onCreate 里要通知权限的那一条
        }
        return a;
    }

    private static Uri uri(String path) {
        return Uri.parse("content://test.share/" + path);
    }

    private static byte[] bytes(String text) {
        return text.getBytes(UTF8);
    }

    private static File shareDir(MainActivity a) {
        return new File(a.getCacheDir(), CacheClean.DIR_SHARE);
    }

    @Test
    public void copiesTheSharedStreamIntoTheCache() throws Exception {
        MainActivity a = launch();
        Uri u = uri("p1");
        ContentResolver resolver = a.getContentResolver();
        shadowOf(resolver).registerInputStream(u, new ByteArrayInputStream(bytes("图片的字节")));

        File dir = shareDir(a);
        File out = MainActivity.copySharedFile(resolver, u, dir, "海边.jpg",
                MainActivity.SHARE_MAX_FILE_BYTES);

        assertNotNull(out);
        assertTrue("落在 cache/share 里，设置里的「临时文件」才看得见", out.getParentFile()
                .equals(dir));
        assertTrue(out.getName().endsWith("-海边.jpg"));
        assertEquals("图片的字节", new String(readAll(out), UTF8));
    }

    @Test
    public void oversizedFileIsRefusedWithoutALeftover() throws Exception {
        MainActivity a = launch();
        Uri u = uri("big");
        ContentResolver resolver = a.getContentResolver();
        shadowOf(resolver).registerInputStream(u, new ByteArrayInputStream(bytes("0123456789")));

        File out = MainActivity.copySharedFile(resolver, u, shareDir(a), "big.bin", 4);

        assertNull(out);
        File[] left = shareDir(a).listFiles();
        assertTrue("半截文件不该留下", left == null || left.length == 0);
    }

    @Test
    public void emptyFileIsNotAFile() throws Exception {
        MainActivity a = launch();
        Uri u = uri("empty");
        ContentResolver resolver = a.getContentResolver();
        shadowOf(resolver).registerInputStream(u, new ByteArrayInputStream(new byte[0]));

        File out = MainActivity.copySharedFile(resolver, u, shareDir(a), "empty.jpg", 1024);

        assertNull(out);
        File[] left = shareDir(a).listFiles();
        assertTrue(left == null || left.length == 0);
    }

    @Test
    public void unreadableUriGivesNull() throws Exception {
        MainActivity a = launch();
        File out = MainActivity.copySharedFile(a.getContentResolver(), uri("nothing"),
                shareDir(a), "x.jpg", 1024);
        assertNull(out);
    }

    @Test
    public void fileNamesCannotEscapeTheDirectory() {
        String name = MainActivity.sharedFileName(uri("p1"), "../../etc/passwd");
        assertFalse(name.contains("/"));
        assertFalse(name.contains("\\"));
        assertTrue(name.endsWith("-.._.._etc_passwd"));

        assertEquals("-file", MainActivity.sharedFileName(null, null).substring(13));
        String longName = MainActivity.sharedFileName(uri("p2"), repeat('a', 200) + ".png");
        assertTrue(longName.length() < 80);
        assertTrue("长名字也要留住扩展名", longName.endsWith(".png"));
    }

    @Test
    public void singleStreamComesFromEitherPlace() {
        Uri one = uri("a.jpg");
        Uri two = uri("b.jpg");

        Intent send = new Intent(Intent.ACTION_SEND).setType("image/jpeg")
                .putExtra(Intent.EXTRA_STREAM, one);
        assertEquals(Arrays.asList(one), MainActivity.sharedUris(send));

        Intent clip = new Intent(Intent.ACTION_SEND).setType("image/jpeg");
        clip.setClipData(new ClipData("图", new String[]{"image/jpeg"}, new ClipData.Item(one)));
        assertEquals(Arrays.asList(one), MainActivity.sharedUris(clip));

        Intent neither = new Intent(Intent.ACTION_VIEW).setData(one);
        assertTrue(MainActivity.sharedUris(neither).isEmpty());
    }

    @Test
    public void multipleSharesAreDedupedAndCapped() {
        List<Uri> list = new ArrayList<>();
        for (int i = 0; i < 8; i++) list.add(uri("m" + i));
        list.add(uri("m0")); // 重复
        Intent many = new Intent(Intent.ACTION_SEND_MULTIPLE).setType("image/jpeg")
                .putParcelableArrayListExtra(Intent.EXTRA_STREAM, new ArrayList<>(list));

        List<Uri> got = MainActivity.sharedUris(many);

        assertEquals(MainActivity.SHARE_MAX_FILES, got.size());
        assertEquals(uri("m0"), got.get(0));
        assertEquals(uri("m4"), got.get(4));
    }

    @Test
    public void tagTellsImagesFromOtherFiles() {
        assertEquals(R.string.share_image_tag, MainActivity.shareTag("image/png"));
        assertEquals(R.string.share_file_tag, MainActivity.shareTag("application/pdf"));
        assertEquals(R.string.share_file_tag, MainActivity.shareTag(null));
    }

    @Test
    public void captionComesFirstThenOneLinePerFile() {
        List<String> lines = Arrays.asList("[分享的图片] /a/b.jpg", "[分享的文件] /a/c.pdf");
        assertEquals("看这个\n[分享的图片] /a/b.jpg\n[分享的文件] /a/c.pdf",
                MainActivity.composeShare("看这个", lines));
        assertEquals("[分享的图片] /a/b.jpg", MainActivity.composeShare(null, lines.subList(0, 1)));
        assertEquals("", MainActivity.composeShare(null, new ArrayList<String>()));
    }

    @Test
    public void sharedImageEndsUpInTheComposerAsAPath() throws Exception {
        MainActivity a = launch();
        Uri u = uri("photo");
        shadowOf(a.getContentResolver()).registerInputStream(u,
                new ByteArrayInputStream(bytes("jpeg-bytes")));

        int[] lost = new int[1];
        String message = a.saveShared(Arrays.asList(u), "在海边拍的", lost);

        assertEquals("两个提示都要对：一个都没丢", 0, lost[0]);
        assertTrue(message.startsWith("在海边拍的\n"));
        assertTrue(message.contains("jpeg-bytes") || message.contains("/"));

        // 内容真落盘了，路径就在消息里
        File[] files = shareDir(a).listFiles();
        assertNotNull(files);
        assertEquals(1, files.length);
        assertTrue(message.contains(files[0].getAbsolutePath()));
    }

    @Test
    public void unreadableShareIsCountedInsteadOfSwallowed() {
        MainActivity a = launch();
        int[] lost = new int[1];
        String message = a.saveShared(Arrays.asList(uri("gone"), uri("gone2")), null, lost);

        assertEquals(2, lost[0]);
        assertEquals("", message);
    }

    @Test
    public void imageShareReachesTheComposer() throws Exception {
        MainActivity a = launch();
        Uri u = uri("pic");
        shadowOf(a.getContentResolver()).registerInputStream(u,
                new ByteArrayInputStream(bytes("pic-bytes")));

        // 走的就是 handleShareIntent 里那条路（文件取回来之后由 UI 线程塞）
        a.handleShareIntent(new Intent(Intent.ACTION_SEND).setType("image/jpeg")
                .putExtra(Intent.EXTRA_STREAM, u));
        File[] files = waitForFiles(a);

        assertNotNull(files);
        assertEquals(1, files.length);
        // 拷完文件之后还有一次 runOnUiThread 才真正塞进输入框，把主线程排空
        for (int i = 0; i < 20; i++) {
            shadowOf(a.getMainLooper()).idle();
            Thread.sleep(10);
        }

        WebView web = a.findViewById(R.id.web);
        web.getWebViewClient().onPageFinished(web, BASE + "/chat");
        String js = shadowOf(web).getLastEvaluatedJavascript();
        assertNotNull(js);
        assertTrue("输入框里要带着这张图的路径", js.contains(files[0].getName()));
        // 影子环境里问不到 MIME，标签可能退成「文件」，两种都算对
        assertTrue(js.contains(a.getString(R.string.share_image_tag))
                || js.contains(a.getString(R.string.share_file_tag)));
    }

    private static File[] waitForFiles(MainActivity a) throws Exception {
        for (int i = 0; i < 100; i++) {
            File[] files = shareDir(a).listFiles();
            if (files != null && files.length > 0) return files;
            Thread.sleep(50);
            shadowOf(a.getMainLooper()).idle();
        }
        return shareDir(a).listFiles();
    }

    private static byte[] readAll(File f) throws Exception {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        java.io.InputStream in = new java.io.FileInputStream(f);
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toByteArray();
    }

    private static String repeat(char c, int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) sb.append(c);
        return sb.toString();
    }
}
