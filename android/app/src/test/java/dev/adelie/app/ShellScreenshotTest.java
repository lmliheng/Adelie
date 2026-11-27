package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import android.graphics.Bitmap;
import android.provider.Settings;
import androidx.test.core.app.ApplicationProvider;
import android.graphics.Canvas;
import android.view.View;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.shadows.ShadowLooper;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * 不用模拟器也能看见界面：Robolectric 用真实图形栈把 Activity 画成 PNG。
 *
 *   ./gradlew :app:testDebugUnitTest --tests dev.adelie.app.ShellScreenshotTest
 *
 * 图落在 app/build/ui-shots/ 下。这里同时是最好的崩溃检查：onCreate 里任何一个
 * 主题属性、布局 id、Material 组件用错都会让测试直接失败。
 */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class ShellScreenshotTest {

    private static final int W = 1080;
    private static final int H = 2340;

    private ActivityController<MainActivity> launch() {
        // 服务是前台 Service 里的线程在跑，单测里不会真的启动；直接把状态摆成就绪。
        // 提醒条要等核心就绪才出现，所以得在建界面之前摆好（onCreate 里就要读到）。
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup();
        MainActivity a = c.get();
        a.findViewById(R.id.splash).setVisibility(View.GONE);
        ShadowLooper.idleMainLooper();
        return c;
    }

    private void shot(MainActivity activity, String name) throws Exception {
        shot(activity, name, H);
    }

    private void shot(MainActivity activity, String name, int height) throws Exception {
        View decor = activity.getWindow().getDecorView();
        decor.measure(View.MeasureSpec.makeMeasureSpec(W, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
        decor.layout(0, 0, W, height);
        Bitmap bmp = Bitmap.createBitmap(W, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        decor.draw(canvas);
        File dir = new File("build/ui-shots");
        assertNotNull(dir);
        dir.mkdirs();
        File out = new File(dir, name + ".png");
        try (OutputStream os = new FileOutputStream(out)) {
            bmp.compress(Bitmap.CompressFormat.PNG, 100, os);
        }
        System.out.println("screenshot: " + out.getAbsolutePath());
    }

    @Test
    public void splashScreen() throws Exception {
        ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup();
        ShadowLooper.idleMainLooper();
        shot(c.get(), "01-splash");
    }

    @Test
    public void mainShell() throws Exception {
        ActivityController<MainActivity> c = launch();
        shot(c.get(), "02-shell-chat");
    }

    @Test
    public void settingsPage() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        com.google.android.material.bottomnavigation.BottomNavigationView nav = a.findViewById(R.id.nav);
        nav.setSelectedItemId(R.id.nav_settings);
        ShadowLooper.idleMainLooper();
        shot(a, "03-settings");
    }

    @Test
    public void settingsDeveloper() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        a.getSharedPreferences("adelie", 0).edit().putBoolean("developer", true).commit();
        com.google.android.material.bottomnavigation.BottomNavigationView nav = a.findViewById(R.id.nav);
        nav.setSelectedItemId(R.id.nav_settings);
        ShadowLooper.idleMainLooper();
        shot(a, "04-settings-developer");
    }

    @Test
    public void logPanel() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        // 日志浮层是开发者模式里的入口，直接调私有方法不行，这里走「重新构建 + 显示」的路径
        a.findViewById(R.id.log_panel).setVisibility(View.VISIBLE);
        ShadowLooper.idleMainLooper();
        shot(a, "05-log-panel");
    }

    /**
     * 首屏提醒条说的第二件事：无障碍开了、电池还没放进「不优化」名单。
     * 拍下来是为了看这句话在小屏上是不是两行就够。
     */
    @Test
    public void hintBarAboutBattery() throws Exception {
        Settings.Secure.putString(ApplicationProvider.getApplicationContext().getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
                "dev.adelie.app/dev.adelie.app.control.AdelieAccessibilityService");
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        assertEquals(android.view.View.VISIBLE, a.findViewById(R.id.hint_bar).getVisibility());
        shot(a, "06-hint-battery");
    }

    /** 开发者那一段里有「导出诊断包」：整页拉长拍，才看得到它在什么位置。 */
    @Test
    public void settingsDeveloperFullPage() throws Exception {
        ApplicationProvider.getApplicationContext()
                .getSharedPreferences("adelie", 0).edit().putBoolean("developer", true).commit();
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        a.findViewById(R.id.nav_settings).performClick();
        ShadowLooper.idleMainLooper();
        shot(a, "07-settings-developer-full", 6600);
    }
}
