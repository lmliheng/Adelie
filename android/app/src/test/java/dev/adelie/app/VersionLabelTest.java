package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.widget.TextView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

/**
 * 界面上写的版本只能是这个 APK 的版本。
 *
 * <p>真机上出过这一幕：装的是 1.3.3，启动页、设置页副标题、关于页却都写着「1.1.4 内测版」——
 * 因为 `strings.xml` 里写死了一个 `version_label`，之后每次发版都没人想起来改它。
 * 现在统一从 PackageManager 读 versionName（去掉 `-beta` 再加「内测版」）。
 */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
public class VersionLabelTest {

    @Test
    public void labelComesFromTheApk() {
        ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup();
        MainActivity activity = controller.get();

        String expected = MainActivity.versionLabel(activity);
        assertEquals(activity.versionName().replace("-beta", "") + " 内测版", expected);
        assertFalse("不能把 -beta 也写进中文标签", expected.contains("-beta"));
        controller.pause().stop().destroy();
    }

    @Test
    public void splashShowsTheRealVersion() {
        ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup();
        MainActivity activity = controller.get();

        TextView splashVersion = activity.findViewById(R.id.splash_version);
        assertEquals(MainActivity.versionLabel(activity), splashVersion.getText().toString());
        assertFalse("不要再出现写死的旧版本：" + splashVersion.getText(),
                splashVersion.getText().toString().contains("1.1.4"));
        controller.pause().stop().destroy();
    }

    @Test
    public void settingsSubtitleShowsTheRealVersion() {
        ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup();
        MainActivity activity = controller.get();
        activity.findViewById(R.id.nav_settings).performClick();

        TextView subtitle = activity.findViewById(R.id.settings_subtitle);
        assertTrue("副标题没带版本：" + subtitle.getText(),
                subtitle.getText().toString().contains(MainActivity.versionLabel(activity)));
        assertFalse(subtitle.getText().toString().contains("1.1.4"));
        controller.pause().stop().destroy();
    }

    @Test
    public void webLineSaysAndroidVersion() {
        ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup();
        MainActivity activity = controller.get();

        String text = MainActivity.webVersionText(activity);
        assertTrue("首页版本行：" + text, text.startsWith("v" + activity.versionName().replace("-beta", "")));
        assertTrue(text.contains("内测版"));
        assertTrue("要标出这是安卓版：" + text, text.contains("安卓"));
        controller.pause().stop().destroy();
    }

    @Test
    public void pageLoadRewritesTheWebVersionLine() {
        ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup();
        MainActivity activity = controller.get();
        android.webkit.WebView web = activity.findViewById(R.id.web);

        activity.injectVersionTag(web);

        String js = Shadows.shadowOf(web).getLastEvaluatedJavascript();
        assertTrue("没注入版本改写：" + js, js.contains("__adelieVerTag"));
        assertTrue(js.contains(MainActivity.webVersionText(activity)));
        // 只在首页那一行动手：要么带「最近更新日期 / 最新版本」，要么整段就是一个版本号
        assertTrue(js.contains("最近更新日期"));
        assertTrue(js.contains("最新版本"));
        controller.pause().stop().destroy();
    }
}
