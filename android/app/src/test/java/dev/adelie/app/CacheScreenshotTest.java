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
 * 「临时文件」清理对话框长什么样：标题、三类各占多少、清理 / 取消两个按钮。
 *
 *   /opt/gradle-8.9/bin/gradle :app:testDebugUnitTest --tests dev.adelie.app.CacheScreenshotTest
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class CacheScreenshotTest {

    @Test
    public void cacheDialogShot() throws Exception {
        Context ctx = ApplicationProvider.getApplicationContext();
        ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE).edit().clear().commit();
        CacheClean.clear(ctx);
        write(ctx, CacheClean.DIR_PHOTOS, "shot-1.jpg", 3 * 1024 * 1024);
        write(ctx, CacheClean.DIR_PHOTOS, "shot-2.jpg", 2 * 1024 * 1024);
        write(ctx, CacheClean.DIR_VIDEOS, "clip-1.mp4", 9 * 1024 * 1024);
        write(ctx, CacheClean.DIR_SHARE, "adelie-journal-20261127-1015.jsonl", 48 * 1024);

        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        a.findViewById(R.id.splash).setVisibility(View.GONE);
        ((BottomNavigationView) a.findViewById(R.id.nav)).setSelectedItemId(R.id.nav_settings);
        ShadowLooper.idleMainLooper();

        View row = find(a.findViewById(R.id.settings_body), a.getString(R.string.row_cache));
        assertNotNull("设置里没找到「临时文件」这一行", row);
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
        try (OutputStream os = new FileOutputStream(new File(dir, "28-cache-dialog.png"))) {
            bmp.compress(Bitmap.CompressFormat.PNG, 100, os);
        }
    }

    private static void write(Context ctx, String dir, String name, int bytes) throws Exception {
        File root = new File(ctx.getCacheDir(), dir);
        assertTrue(root.isDirectory() || root.mkdirs());
        OutputStream out = new FileOutputStream(new File(root, name), false);
        try {
            out.write(new byte[bytes]);
        } finally {
            out.close();
        }
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
