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

/**
 * 崩溃留痕在界面上的那一半：下次开屏提示一次、设置 → 开发者里能看到时间、点开是全文、
 * 能复制也能清空。提示只提示一次 —— 同一个现场反复吓人比不提示还烦。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
public class CrashRowTest {

    private Context ctx;

    @Before
    public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE).edit().clear().commit();
        CrashLog.clear(ctx);
        // 这一行在「开发者」区里
        ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE).edit()
                .putBoolean("developer", true).commit();
    }

    private void seedCrash() {
        CrashLog.write(ctx, Thread.currentThread(), new IllegalStateException("设置页里看到的那次"));
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
        View r = row(a.findViewById(R.id.settings_body), a.getString(R.string.row_crash));
        assertNotNull("设置 → 开发者里没找到「上次异常退出」", r);
        TextView v = r.findViewById(R.id.row_value);
        assertEquals(View.VISIBLE, v.getVisibility());
        return String.valueOf(v.getText());
    }

    @Test
    public void saysNothingWhenNothingCrashed() {
        MainActivity a = openSettings();
        assertEquals(a.getString(R.string.crash_none), value(a));
        // 没崩过就不该有那句提示
        String toast = ShadowToast.getTextOfLatestToast();
        assertFalse(String.valueOf(toast).contains(a.getString(R.string.crash_last_hint)));
    }

    @Test
    public void theNextLaunchMentionsTheCrashOnce() {
        seedCrash();
        MainActivity a = openSettings();
        assertEquals(a.getString(R.string.crash_last_hint), ShadowToast.getTextOfLatestToast());
        // 行上写着那次的时间（HH:mm:ss）
        String shown = value(a);
        assertTrue(shown, shown.matches("\\d{2}:\\d{2}:\\d{2}"));

        // 再开一次：同一个现场不再提示
        MainActivity again = openSettings();
        ShadowToast.reset();
        again.findViewById(R.id.splash).setVisibility(View.GONE);
        String second = ShadowToast.getTextOfLatestToast();
        assertFalse(String.valueOf(second).contains(again.getString(R.string.crash_last_hint)));
    }

    @Test
    public void theDialogShowsTheStackAndCopiesIt() {
        seedCrash();
        MainActivity a = openSettings();
        row(a.findViewById(R.id.settings_body), a.getString(R.string.row_crash)).performClick();
        ShadowLooper.idleMainLooper();

        android.app.Dialog latest = ShadowDialog.getLatestDialog();
        assertNotNull(latest);
        androidx.appcompat.app.AlertDialog dialog = (androidx.appcompat.app.AlertDialog) latest;
        // 弹层里那段等宽文字就是崩溃全文
        assertTrue("弹层里要能看到堆栈",
                String.join("\n", texts(dialog.getWindow().getDecorView()))
                        .contains("IllegalStateException"));

        dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).performClick();
        ShadowLooper.idleMainLooper();

        android.content.ClipboardManager cm = (android.content.ClipboardManager)
                ctx.getSystemService(Context.CLIPBOARD_SERVICE);
        assertNotNull(cm);
        assertTrue("复制得进剪贴板", cm.hasPrimaryClip());
        assertEquals(CrashLog.read(ctx),
                String.valueOf(cm.getPrimaryClip().getItemAt(0).getText()));
    }

    /** 弹层里所有文字拼起来（screen 树是嵌套的）。 */
    private static java.util.List<String> texts(View root) {
        java.util.List<String> out = new java.util.ArrayList<>();
        if (root instanceof TextView) {
            CharSequence value = ((TextView) root).getText();
            if (value != null) out.add(value.toString());
        }
        if (root instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) root;
            for (int i = 0; i < group.getChildCount(); i++) out.addAll(texts(group.getChildAt(i)));
        }
        return out;
    }

    @Test
    public void clearingFromTheDialogForgetsIt() {
        seedCrash();
        MainActivity a = openSettings();
        row(a.findViewById(R.id.settings_body), a.getString(R.string.row_crash)).performClick();
        ShadowLooper.idleMainLooper();

        androidx.appcompat.app.AlertDialog dialog =
                (androidx.appcompat.app.AlertDialog) ShadowDialog.getLatestDialog();
        dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_NEUTRAL).performClick();
        ShadowLooper.idleMainLooper();

        assertFalse(CrashLog.has(ctx));
        assertEquals(a.getString(R.string.crash_none), value(a));
        assertEquals(a.getString(R.string.crash_cleared), ShadowToast.getTextOfLatestToast());
    }

    @Test
    public void tappingWithNoRecordJustSaysSo() {
        MainActivity a = openSettings();
        int before = ShadowDialog.getShownDialogs().size();
        row(a.findViewById(R.id.settings_body), a.getString(R.string.row_crash)).performClick();
        ShadowLooper.idleMainLooper();

        assertEquals(before, ShadowDialog.getShownDialogs().size());
        assertEquals(a.getString(R.string.crash_nothing), ShadowToast.getTextOfLatestToast());
    }
}
