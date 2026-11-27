package dev.adelie.app;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

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
 * 「上次异常退出」的现场对话框长什么样：等宽的堆栈 + 复制 / 清空 / 取消。
 *
 *   /opt/gradle-8.9/bin/gradle :app:testDebugUnitTest --tests dev.adelie.app.CrashScreenshotTest
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class CrashScreenshotTest {

    @Test
    public void crashDialogShot() throws Exception {
        Context ctx = ApplicationProvider.getApplicationContext();
        ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE).edit().clear().commit();
        ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE).edit()
                .putBoolean("developer", true).commit();
        CrashLog.clear(ctx);
        CrashLog.write(ctx, Thread.currentThread(),
                new IllegalStateException("点「发送」时前面板没了"));

        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        a.findViewById(R.id.splash).setVisibility(View.GONE);
        ((BottomNavigationView) a.findViewById(R.id.nav)).setSelectedItemId(R.id.nav_settings);
        ShadowLooper.idleMainLooper();

        View row = find(a.findViewById(R.id.settings_body), a.getString(R.string.row_crash));
        assertNotNull("设置里没找到「上次异常退出」", row);
        row.performClick();
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
        try (OutputStream os = new FileOutputStream(new File(dir, "29-crash-dialog.png"))) {
            bmp.compress(Bitmap.CompressFormat.PNG, 100, os);
        }
        CrashLog.clear(ctx);
    }

    private static View find(View root, String title) {
        if (!(root instanceof ViewGroup)) return null;
        ViewGroup group = (ViewGroup) root;
        TextView own = root.findViewById(R.id.row_title);
        if (own != null && title.contentEquals(own.getText())) return root;
        for (int i = 0; i < group.getChildCount(); i++) {
            View hit = find(group.getChildAt(i), title);
            if (hit != null) return hit;
        }
        return null;
    }
}
