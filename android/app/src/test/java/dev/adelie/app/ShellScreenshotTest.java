package dev.adelie.app;

import static org.junit.Assert.assertNotNull;

import android.graphics.Bitmap;
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
        ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup();
        MainActivity a = c.get();
        // 服务是前台 Service 里的线程在跑，单测里不会真的启动；直接把状态摆成就绪
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        a.findViewById(R.id.splash).setVisibility(View.GONE);
        ShadowLooper.idleMainLooper();
        return c;
    }

    private void shot(MainActivity activity, String name) throws Exception {
        View decor = activity.getWindow().getDecorView();
        decor.measure(View.MeasureSpec.makeMeasureSpec(W, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(H, View.MeasureSpec.EXACTLY));
        decor.layout(0, 0, W, H);
        Bitmap bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
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
}
