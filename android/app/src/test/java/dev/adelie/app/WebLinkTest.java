package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.content.Intent;
import android.webkit.WebView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * 网页里的外链：Adelie 自己的页面留在 WebView 里，别人的站点、mailto、tel、各家 App 的
 * scheme 交给系统去开。不这么分的话，点一个文档链接就跳走了、回不来，底部 tab 还指着 Adelie。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
public class WebLinkTest {

    private MainActivity launch() {
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://127.0.0.1:48231";
        Core.ready = true;
        MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        a.findViewById(R.id.splash).setVisibility(android.view.View.GONE);
        // onCreate 会去要通知权限（那是另一件事）：先把这一条清掉，后面只看链接有没有出去
        while (shadowOf(a).getNextStartedActivity() != null) {
            // 清空队列
        }
        return a;
    }

    @Test
    public void ownPagesStayInside() {
        MainActivity a = launch();
        assertFalse("自家页面不该踢到浏览器", a.handleWebUrl("http://127.0.0.1:48231/chat"));
        assertEquals("自家页面不该启动任何 Activity", null, shadowOf(a).getNextStartedActivity());
    }

    @Test
    public void otherSitesGoToTheSystem() {
        MainActivity a = launch();
        assertTrue(a.handleWebUrl("https://github.com/ccch1mneyyy/dsh-Go"));
        Intent started = shadowOf(a).getNextStartedActivity();
        assertNotNull(started);
        assertEquals(Intent.ACTION_VIEW, started.getAction());
        assertEquals("https://github.com/ccch1mneyyy/dsh-Go", started.getData().toString());
    }

    @Test
    public void otherSchemesGoToTheSystemToo() {
        MainActivity a = launch();
        assertTrue(a.handleWebUrl("mailto:someone@example.com"));
        assertEquals("mailto:someone@example.com",
                shadowOf(a).getNextStartedActivity().getData().toString());
    }

    @Test
    public void internalPseudoUrlsAreNotLinks() {
        MainActivity a = launch();
        assertFalse(a.handleWebUrl("about:blank"));
        assertFalse(a.handleWebUrl("javascript:void(0)"));
        assertFalse(a.handleWebUrl(""));
        assertFalse(a.handleWebUrl(null));
    }

    @Test
    public void theRuleIsJustTheHost() {
        assertTrue(MainActivity.isOwnUrl("http://127.0.0.1:48231/x", "http://127.0.0.1:48231"));
        assertTrue(MainActivity.isOwnUrl("http://localhost:48231/x", "http://localhost:48231/"));
        // 只比 host，不比端口：服务每次起在随机端口上，换个端口还是自己那份页面
        assertTrue(MainActivity.isOwnUrl("http://127.0.0.1:9999/x", "http://127.0.0.1:48231"));
        assertFalse(MainActivity.isOwnUrl("http://10.0.0.2:48231/x", "http://127.0.0.1:48231"));
        // 服务还没起来的时候不知道自己在哪个 host：别的站点照样交出去
        assertFalse(MainActivity.isOwnUrl("https://example.com", null));
    }

    /** WebView 真调的那条重载（WebResourceRequest）也得走同一套判断。 */
    @Test
    public void theWebViewClientRoutesLinks() {
        MainActivity a = launch();
        WebView web = a.findViewById(R.id.web);
        android.webkit.WebViewClient client = shadowOf(web).getWebViewClient();
        assertNotNull(client);
        assertTrue(client.shouldOverrideUrlLoading(web, "https://example.com/a"));
        assertEquals(Intent.ACTION_VIEW,
                shadowOf(a).getNextStartedActivity().getAction());
        assertFalse(client.shouldOverrideUrlLoading(web, "http://127.0.0.1:48231/agents"));
    }
}
