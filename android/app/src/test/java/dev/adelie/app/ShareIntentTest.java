package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.webkit.WebView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowToast;

/**
 * 别的应用「分享」一段文字/链接进来：落到对话页的输入框里。
 *
 * <p>手机上这事的真实路径是：在浏览器或微信里点「分享」→ 系统把 {@code ACTION_SEND} 递给 Adelie →
 * 外壳打开（或唤起）对话页 → 页面自己把文字塞进输入框。这里把网页换成影子：
 * 看{{@link MainActivity#shareScript(String)}} 递出去的脚本对不对、桥回话之后 toast 与剪贴板怎么处理。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
public class ShareIntentTest {

    private static final String BASE = "http://127.0.0.1:48231";

    private MainActivity launch(Intent intent) {
        Core.phase = "服务已就绪";
        Core.baseUrl = BASE;
        Core.ready = true;
        MainActivity a = intent == null
                ? Robolectric.buildActivity(MainActivity.class).setup().get()
                : Robolectric.buildActivity(MainActivity.class, intent).setup().get();
        a.findViewById(R.id.splash).setVisibility(android.view.View.GONE);
        while (shadowOf(a).getNextStartedActivity() != null) {
            // 清掉 onCreate 里要通知权限的那一条
        }
        return a;
    }

    private static Intent share(String text) {
        return new Intent(Intent.ACTION_SEND).setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, text);
    }

    private static void pageFinished(MainActivity a, String url) {
        WebView web = a.findViewById(R.id.web);
        web.getWebViewClient().onPageFinished(web, url);
    }

    private static String lastJs(MainActivity a) {
        return shadowOf((WebView) a.findViewById(R.id.web)).getLastEvaluatedJavascript();
    }

    @Test
    public void sharedTextGoesIntoTheComposerWhenTheChatPageIsUp() {
        MainActivity a = launch(share("看看这个 https://example.com/a?b=1"));

        pageFinished(a, BASE + "/chat");

        String js = lastJs(a);
        assertNotNull("对话页一出来就该往输入框里塞", js);
        assertTrue(js.contains("https://example.com/a?b=1"));
        assertTrue(js.contains("AdelieShell.shared"));
        assertTrue(js.contains("HTMLTextAreaElement"));
    }

    @Test
    public void shareArrivingWhileOnAnotherTabFirstGoesToTheChatPage() {
        MainActivity a = launch(share("这段话要放进对话里"));

        pageFinished(a, BASE + "/agents");

        WebView web = a.findViewById(R.id.web);
        assertEquals("不在对话页就先跳过去", BASE + "/chat", shadowOf(web).getLastLoadedUrl());
        String before = lastJs(a);
        assertFalse("跳之前别塞，页面还没到", before != null && before.contains("这段话要放进对话里"));

        pageFinished(a, BASE + "/chat");
        assertTrue(lastJs(a).contains("这段话要放进对话里"));
    }

    @Test
    public void placedShotSaysSoAndStopsRepeating() {
        MainActivity a = launch(share("一段文字"));
        pageFinished(a, BASE + "/chat");

        a.onSharePlaced(true);
        assertEquals(a.getString(R.string.share_placed), ShadowToast.getTextOfLatestToast());

        // 已经清掉了：再来一次不该再弹、也不该动剪贴板
        a.onSharePlaced(true);
        assertEquals(a.getString(R.string.share_placed), ShadowToast.getTextOfLatestToast());
        assertNull(clipboard(a));
    }

    @Test
    public void composerNotFoundFallsBackToTheClipboard() {
        MainActivity a = launch(share("找不到输入框时也要留住内容"));
        pageFinished(a, BASE + "/chat");

        a.onSharePlaced(false);

        assertEquals(a.getString(R.string.share_copied), ShadowToast.getTextOfLatestToast());
        assertEquals("找不到输入框时也要留住内容", clipboard(a));
    }

    @Test
    public void bridgeIsWiredToTheSameFallback() {
        MainActivity a = launch(null);
        a.handleShareIntent(share("从桥里回话"));
        pageFinished(a, BASE + "/chat");

        a.new PageBridge().shared(false);

        assertEquals("从桥里回话", clipboard(a));
        assertEquals(a.getString(R.string.share_copied), ShadowToast.getTextOfLatestToast());
    }

    private static String clipboard(MainActivity a) {
        ClipboardManager cm = (ClipboardManager) a.getSystemService(MainActivity.CLIPBOARD_SERVICE);
        if (cm == null || cm.getPrimaryClip() == null) return null;
        ClipData clip = cm.getPrimaryClip();
        if (clip.getItemCount() == 0) return null;
        CharSequence text = clip.getItemAt(0).coerceToText(a);
        return text == null ? null : text.toString();
    }

    @Test
    public void onlyTextSharesArePickedUp() {
        assertNull(MainActivity.sharedText(null));
        assertNull(MainActivity.sharedText(new Intent(Intent.ACTION_VIEW).putExtra(
                Intent.EXTRA_TEXT, "不是分享")));
        assertNull(MainActivity.sharedText(new Intent(Intent.ACTION_SEND)
                .setType("image/png").putExtra(Intent.EXTRA_TEXT, "图")));
        assertNull(MainActivity.sharedText(new Intent(Intent.ACTION_SEND)
                .setType("text/plain").putExtra(Intent.EXTRA_TEXT, "   ")));
        assertEquals("一段话", MainActivity.sharedText(share("  一段话  ")));
    }

    @Test
    public void imageShareDoesNothingAtAll() {
        MainActivity a = launch(null);
        a.handleShareIntent(new Intent(Intent.ACTION_SEND).setType("image/png")
                .putExtra(Intent.EXTRA_TEXT, "这只是图"));

        pageFinished(a, BASE + "/chat");

        String js = lastJs(a);
        assertFalse("图片分享不该往页面里塞东西", js != null && js.contains("这只是图"));
        assertNull(clipboard(a));
    }

    @Test
    public void longShareIsTruncated() {
        StringBuilder short3k = new StringBuilder();
        for (int i = 0; i < 3000; i++) short3k.append("长");
        assertEquals(3000, MainActivity.sharedText(share(short3k.toString())).length());

        StringBuilder huge = new StringBuilder();
        for (int i = 0; i < 10000; i++) huge.append("字");
        String cut = MainActivity.sharedText(share(huge.toString()));
        assertEquals(MainActivity.SHARE_MAX + 1, cut.length()); // 末尾一个省略号
        assertTrue(cut.endsWith("…"));
    }

    @Test
    public void scriptEscapesWhateverTheUserShared() {
        String js = MainActivity.shareScript("他说'你好'\n<看点>\\");

        assertTrue("单引号要转义，不然脚本会被撕开", js.contains("\\'"));
        assertTrue("换行要转义", js.contains("\\n"));
        assertTrue("尖括号要转义", js.contains("\\u003c"));
        assertTrue("反斜杠要转义", js.contains("\\\\"));
        assertTrue(js.startsWith("(function(){"));
        assertTrue(js.endsWith("})()"));
        assertFalse(js.contains("'你好'\n"));
    }

    @Test
    public void scriptAppendsInsteadOfOverwritingWhatWasTyped() {
        String js = MainActivity.shareScript("补一句");
        assertTrue("已经打了一半字时，分享的内容接在后面而不是顶掉", js.contains("el.value?el.value"));
    }
}
