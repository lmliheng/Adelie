package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.View;

import com.google.android.material.textfield.TextInputEditText;

import androidx.test.core.app.ApplicationProvider;

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
import java.util.Arrays;
import java.util.List;

import dev.adelie.app.control.PhoneControl;

/**
 * 「允许操作的应用」选择器的实际样子：整个弹窗、搜「微信」之后、搜不到的空态。
 * 没有真机，靠它看高度对不对、勾选框和最下面三个按钮有没有被挤掉。
 *
 *   /opt/gradle-8.9/bin/gradle :app:testDebugUnitTest --tests dev.adelie.app.AppPickerScreenshotTest
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class AppPickerScreenshotTest {

    private static final List<String> LABELS = Arrays.asList(
            "微信", "文件管理", "相机", "支付宝", "高德地图", "网易云音乐",
            "哔哩哔哩", "京东", "淘宝", "饿了么", "钉钉", "小红书");
    private static final List<String> PACKAGES = Arrays.asList(
            "com.tencent.mm", "com.oneplus.filemanager", "com.oneplus.camera",
            "com.eg.android.AlipayGphone", "com.autonavi.minimap", "com.netease.cloudmusic",
            "tv.danmaku.bili", "com.jingdong.app.mall", "com.taobao.taobao",
            "me.ele", "com.alibaba.android.rimet", "com.xingin.xhs");

    private MainActivity activity;
    private androidx.appcompat.app.AlertDialog dialog;

    private void open() {
        Context ctx = ApplicationProvider.getApplicationContext();
        ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE).edit().clear().commit();
        PhoneControl.setAllowedPackages(new String[]{"com.tencent.mm"});
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        activity = Robolectric.buildActivity(MainActivity.class).setup().get();
        activity.findViewById(R.id.splash).setVisibility(View.GONE);
        activity.showAppPicker(LABELS, PACKAGES);
        ShadowLooper.idleMainLooper();
        android.app.Dialog latest = ShadowDialog.getLatestDialog();
        assertNotNull(latest);
        dialog = (androidx.appcompat.app.AlertDialog) latest;
    }

    private void shot(String name) throws Exception {
        View decor = dialog.getWindow().getDecorView();
        int w = activity.getResources().getDisplayMetrics().widthPixels;
        int h = activity.getResources().getDisplayMetrics().heightPixels;
        decor.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.AT_MOST),
                View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.AT_MOST));
        decor.layout(0, 0, decor.getMeasuredWidth(), decor.getMeasuredHeight());
        Bitmap bmp = Bitmap.createBitmap(decor.getMeasuredWidth(), decor.getMeasuredHeight(),
                Bitmap.Config.ARGB_8888);
        decor.draw(new Canvas(bmp));
        File dir = new File("build/ui-shots");
        dir.mkdirs();
        try (OutputStream os = new FileOutputStream(new File(dir, name + ".png"))) {
            bmp.compress(Bitmap.CompressFormat.PNG, 100, os);
        }
    }

    @Test
    public void threeShotsInARow() throws Exception {
        open();
        android.widget.ListView list = dialog.findViewById(R.id.picker_list);
        assertEquals(LABELS.size(), list.getAdapter().getCount());
        // 弹窗高度不能一路顶到屏幕底：列表区最多 420dp
        shot("24-app-picker");

        TextInputEditText search = dialog.findViewById(R.id.picker_search);
        search.setText("微信");
        ShadowLooper.idleMainLooper();
        assertEquals(1, list.getAdapter().getCount());
        shot("25-app-picker-search");

        search.setText("没有这个应用");
        ShadowLooper.idleMainLooper();
        assertEquals(0, list.getAdapter().getCount());
        assertEquals(View.VISIBLE, dialog.findViewById(R.id.picker_empty).getVisibility());
        shot("26-app-picker-none");
    }
}
