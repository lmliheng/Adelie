package dev.adelie.app;

import static org.junit.Assert.assertTrue;

import android.webkit.WebView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

/**
 * 弹层滑不动是网页端的 flex 缺 min-height:0，外壳在每次页面加载后补一条样式兜底。
 * 这里锁住「页面加载后确实注入了」这件事 —— 真机上要是漏了，设置里的长列表就又卡住不动。
 */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
public class MobileFixInjectionTest {

    @Test
    public void pageLoadInjectsScrollFix() {
        ActivityController<MainActivity> controller =
                Robolectric.buildActivity(MainActivity.class).setup();
        MainActivity activity = controller.get();
        WebView web = activity.findViewById(R.id.web);

        web.getWebViewClient().onPageFinished(web, "http://127.0.0.1:1234/chat");

        String js = Shadows.shadowOf(web).getLastEvaluatedJavascript();
        assertTrue("没有注入样式：" + js, js.contains("adelie-mobile-fix"));
        assertTrue(js.contains("min-height:0!important"));
        assertTrue(js.contains("ui-scrim"));
        controller.pause().stop().destroy();
    }
}
