package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.test.core.app.ApplicationProvider;

import com.google.android.material.bottomnavigation.BottomNavigationView;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowDialog;
import org.robolectric.shadows.ShadowLooper;
import org.robolectric.shadows.ShadowToast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * 设置 → 关于 →「临时文件」：拍照、录像、导出的日志占了多少，点进去能清。
 * 这个行要是看不到、算不准、或者清的时候顺手把任务日志删了，用户就没法信任它。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
public class CacheRowTest {

    private Context ctx;

    @Before
    public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE).edit().clear().commit();
        CacheClean.clear(ctx);
    }

    private File write(String dir, String name, int bytes) throws Exception {
        File root = new File(ctx.getCacheDir(), dir);
        assertTrue(root.isDirectory() || root.mkdirs());
        File file = new File(root, name);
        OutputStream out = new FileOutputStream(file, false);
        try {
            out.write(new byte[bytes]);
        } finally {
            out.close();
        }
        return file;
    }

    private MainActivity openSettings() {
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        a.findViewById(R.id.splash).setVisibility(View.GONE);
        ((BottomNavigationView) a.findViewById(R.id.nav)).setSelectedItemId(R.id.nav_settings);
        ShadowLooper.idleMainLooper();
        return a;
    }

    private View row(View root, String title) {
        if (!(root instanceof ViewGroup)) return null;
        ViewGroup group = (ViewGroup) root;
        TextView own = root.findViewById(R.id.row_title);
        if (own != null && title.contentEquals(own.getText())) return root;
        for (int i = 0; i < group.getChildCount(); i++) {
            View hit = row(group.getChildAt(i), title);
            if (hit != null) return hit;
        }
        return null;
    }

    private String value(MainActivity a) {
        View r = row(a.findViewById(R.id.settings_body), a.getString(R.string.row_cache));
        assertNotNull("设置里没找到「临时文件」这一行", r);
        TextView v = r.findViewById(R.id.row_value);
        assertNotNull(v);
        assertEquals(View.VISIBLE, v.getVisibility());
        return String.valueOf(v.getText());
    }

    @Test
    public void saysNothingIsCachedWhenNothingIs() {
        MainActivity a = openSettings();
        assertEquals(a.getString(R.string.row_cache_empty), value(a));
    }

    @Test
    public void showsHowMuchSpaceTheTemporaryFilesTake() throws Exception {
        write(CacheClean.DIR_PHOTOS, "shot-1.jpg", 1024 * 1024);
        write(CacheClean.DIR_PHOTOS, "shot-2.jpg", 1024 * 1024);
        write(CacheClean.DIR_VIDEOS, "clip.mp4", 1024 * 1024);
        write(CacheClean.DIR_SHARE, "journal.jsonl", 512);

        MainActivity a = openSettings();
        assertEquals("3.0 MB", value(a));
    }

    /** 点进去先看清是些什么，再决定清不清。 */
    @Test
    public void theDialogBreaksItDownByKind() throws Exception {
        write(CacheClean.DIR_PHOTOS, "shot-1.jpg", 1024 * 1024);
        write(CacheClean.DIR_PHOTOS, "shot-2.jpg", 1024 * 1024);
        write(CacheClean.DIR_VIDEOS, "clip.mp4", 1024 * 1024);
        write(CacheClean.DIR_SHARE, "journal.jsonl", 512);

        MainActivity a = openSettings();
        row(a.findViewById(R.id.settings_body), a.getString(R.string.row_cache)).performClick();
        ShadowLooper.idleMainLooper();

        android.app.Dialog latest = ShadowDialog.getLatestDialog();
        assertNotNull(latest);
        androidx.appcompat.app.AlertDialog dialog = (androidx.appcompat.app.AlertDialog) latest;
        String body = String.valueOf(
                ((TextView) dialog.findViewById(android.R.id.message)).getText());
        assertTrue(body, body.contains("拍照 2 张 · 2.0 MB"));
        assertTrue(body, body.contains("录像 1 段 · 1.0 MB"));
        assertTrue(body, body.contains("导出的日志 1 份 · 512 B"));

        // 取消：一个字节都不动
        dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_NEGATIVE).performClick();
        ShadowLooper.idleMainLooper();
        assertEquals("3.0 MB", value(a));
        assertEquals(1, new File(new File(ctx.getCacheDir(), CacheClean.DIR_VIDEOS),
                "clip.mp4").length() > 0 ? 1 : 0);
    }

    @Test
    public void clearingFreesTheSpaceAndRebuildsTheRow() throws Exception {
        File photo = write(CacheClean.DIR_PHOTOS, "shot.jpg", 1024 * 1024);
        File clip = write(CacheClean.DIR_VIDEOS, "clip.mp4", 1024 * 1024);
        // 数据目录里的任务日志不该丢
        File data = new File(ctx.getFilesDir(), "adelie/data");
        assertTrue(data.isDirectory() || data.mkdirs());
        File journal = new File(data, "phone-journal.jsonl");
        OutputStream out = new FileOutputStream(journal, false);
        out.write("{\"action\":\"读屏\"}\n".getBytes("UTF-8"));
        out.close();

        MainActivity a = openSettings();
        assertEquals("2.0 MB", value(a));
        row(a.findViewById(R.id.settings_body), a.getString(R.string.row_cache)).performClick();
        ShadowLooper.idleMainLooper();

        androidx.appcompat.app.AlertDialog dialog =
                (androidx.appcompat.app.AlertDialog) ShadowDialog.getLatestDialog();
        dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).performClick();
        ShadowLooper.idleMainLooper();

        assertFalse(photo.exists());
        assertFalse(clip.exists());
        assertTrue("任务日志不能跟着被清掉", journal.exists());
        assertEquals(a.getString(R.string.row_cache_empty), value(a));
        assertEquals("已清理 2.0 MB", ShadowToast.getTextOfLatestToast());
    }

    /** 什么都没有的时候点进去：说一句就行，不弹一个空对话框。 */
    @Test
    public void tappingWithNothingToClearJustSaysSo() {
        MainActivity a = openSettings();
        int before = ShadowDialog.getShownDialogs().size();
        row(a.findViewById(R.id.settings_body), a.getString(R.string.row_cache)).performClick();
        ShadowLooper.idleMainLooper();

        assertEquals(before, ShadowDialog.getShownDialogs().size());
        assertEquals(a.getString(R.string.cache_clear_nothing),
                ShadowToast.getTextOfLatestToast());
    }
}
