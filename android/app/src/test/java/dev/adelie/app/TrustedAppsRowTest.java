package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

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

import dev.adelie.app.control.PhoneControl;

/**
 * 设置 → 手机操控里的「不再追问的应用」：确认卡上点过「以后都允许」的应用会记在这里，
 * 一行小字写着几个；点进去能一键清空（清空前先问一声）。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
public class TrustedAppsRowTest {

    private Context ctx;

    /** 和 PhoneControl 里那个键保持一致：这里直接摆偏好，模拟「上次点过以后都允许」。 */
    private static final String PREF_TRUSTED = "control_trusted_apps";

    @Before
    public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE).edit().clear().commit();
        PhoneControl.clearTrusted();
    }

    private void rememberTrusted(String... packages) {
        ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE).edit()
                .putStringSet(PREF_TRUSTED, new java.util.HashSet<>(java.util.Arrays.asList(packages)))
                .commit();
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

    /** 设置页里按标题找到那一行（卡片是嵌套的，得递归找）。 */
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

    /** 那一行右边的值（看不见就当空串）。 */
    private String rowValue(MainActivity a, String title) {
        View r = row(a.findViewById(R.id.settings_body), title);
        assertNotNull("没找到这一行：" + title, r);
        TextView value = r.findViewById(R.id.row_value);
        return value == null || value.getVisibility() != View.VISIBLE
                ? "" : String.valueOf(value.getText());
    }

    @Test
    public void saysNothingIsTrustedByDefault() {
        MainActivity a = openSettings();
        String title = a.getString(R.string.row_control_trusted);
        assertEquals(a.getString(R.string.row_control_trusted_none), rowValue(a, title));
    }

    @Test
    public void countsTheTrustedApps() {
        rememberTrusted("com.tencent.mm", "com.oneplus.filemanager");

        MainActivity a = openSettings();

        assertEquals("2 个", rowValue(a, a.getString(R.string.row_control_trusted)));
    }

    @Test
    public void clearingAsksFirstAndThenForgets() {
        rememberTrusted("com.tencent.mm");
        MainActivity a = openSettings();
        String title = a.getString(R.string.row_control_trusted);
        assertEquals("1 个", rowValue(a, title));

        row(a.findViewById(R.id.settings_body), title).performClick();
        ShadowLooper.idleMainLooper();
        android.app.Dialog latest = ShadowDialog.getLatestDialog();
        assertNotNull(latest);
        assertTrue(latest instanceof androidx.appcompat.app.AlertDialog);
        androidx.appcompat.app.AlertDialog dialog = (androidx.appcompat.app.AlertDialog) latest;
        // 还没点「清空」之前不能先斩后奏
        assertEquals(1, PhoneControl.trustedCount());

        dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).performClick();
        ShadowLooper.idleMainLooper();

        assertEquals(0, PhoneControl.trustedCount());
        assertEquals(a.getString(R.string.row_control_trusted_none), rowValue(a, title));
    }
}
