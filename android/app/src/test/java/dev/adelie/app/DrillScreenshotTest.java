package dev.adelie.app;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.View;

import androidx.test.core.app.ApplicationProvider;

import com.google.android.material.bottomnavigation.BottomNavigationView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.shadows.ShadowDialog;
import org.robolectric.shadows.ShadowLooper;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * 「手机操控演练」的结果弹层长什么样：一行一步，✓ / ✗ / –，下面「复制」。
 *
 *   /opt/gradle-8.9/bin/gradle :app:testDebugUnitTest --tests dev.adelie.app.DrillScreenshotTest
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class DrillScreenshotTest {

    @Test
    public void drillDialogShot() throws Exception {
        Context ctx = ApplicationProvider.getApplicationContext();
        ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE).edit().clear().commit();

        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        a.findViewById(R.id.splash).setVisibility(View.GONE);
        ((BottomNavigationView) a.findViewById(R.id.nav)).setSelectedItemId(R.id.nav_settings);
        ShadowLooper.idleMainLooper();

        String report = "✓ 无障碍：已连上 · 前台 com.tencent.mm · 屏幕 1080x2400\n"
                + "✓ 读屏：读到 42 个控件\n"
                + "✓ 等界面稳住：界面稳住了（820 毫秒）\n"
                + "✗ 找控件：滑了 1 屏没找到「设置」：可能根本不在这个列表里\n"
                + "✓ 截图：拿到 1080x2400 的截图，180 KB\n"
                + "✓ 任务日志：记着 7 条步骤";
        a.showDrillReport(report);
        ShadowLooper.idleMainLooper();

        android.app.Dialog dialog = ShadowDialog.getLatestDialog();
        assertNotNull(dialog);
        View decor = dialog.getWindow().getDecorView();
        int w = a.getResources().getDisplayMetrics().widthPixels;
        int h = a.getResources().getDisplayMetrics().heightPixels;
        decor.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.AT_MOST),
                View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.AT_MOST));
        decor.layout(0, 0, decor.getMeasuredWidth(), decor.getMeasuredHeight());
        assertTrue(decor.getMeasuredHeight() > 0);

        Bitmap bmp = Bitmap.createBitmap(decor.getMeasuredWidth(), decor.getMeasuredHeight(),
                Bitmap.Config.ARGB_8888);
        decor.draw(new Canvas(bmp));
        File dir = new File("build/ui-shots");
        dir.mkdirs();
        try (OutputStream os = new FileOutputStream(new File(dir, "30-drill-dialog.png"))) {
            bmp.compress(Bitmap.CompressFormat.PNG, 100, os);
        }
    }
}
