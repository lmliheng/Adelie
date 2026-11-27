package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.view.View;
import android.widget.ListAdapter;
import android.widget.ListView;

import androidx.test.core.app.ApplicationProvider;

import com.google.android.material.textfield.TextInputEditText;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowDialog;
import org.robolectric.shadows.ShadowLooper;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import dev.adelie.app.control.PhoneControl;

/**
 * 「允许操作的应用」弹窗：几百个应用的手机上，得能按应用名或包名搜出来再勾。
 * 筛选只影响看到的行，勾选按包名记，搜一个勾一个再搜别的不会丢。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
public class AppPickerTest {

    private static final String PREF_APPS = "control_apps";

    private static final List<String> LABELS =
            Arrays.asList("微信", "文件管理", "相机", "支付宝");
    private static final List<String> PACKAGES = Arrays.asList(
            "com.tencent.mm", "com.oneplus.filemanager", "com.oneplus.camera", "com.eg.android.AlipayGphone");

    private Context ctx;
    private MainActivity activity;
    private androidx.appcompat.app.AlertDialog dialog;

    @Before
    public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE).edit().clear().commit();
        PhoneControl.setAllowedPackages(new String[0]);
    }

    private void rememberAllowed(String... packages) {
        Set<String> set = new HashSet<>(Arrays.asList(packages));
        ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE).edit()
                .putStringSet(PREF_APPS, set).commit();
        PhoneControl.setAllowedPackages(packages);
    }

    private void openPicker() {
        openPicker(LABELS, PACKAGES);
    }

    private void openPicker(List<String> labels, List<String> packages) {
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        activity = Robolectric.buildActivity(MainActivity.class).setup().get();
        activity.findViewById(R.id.splash).setVisibility(View.GONE);
        activity.showAppPicker(labels, packages);
        ShadowLooper.idleMainLooper();
        android.app.Dialog latest = ShadowDialog.getLatestDialog();
        assertNotNull("没弹出对话框", latest);
        assertTrue(latest instanceof androidx.appcompat.app.AlertDialog);
        dialog = (androidx.appcompat.app.AlertDialog) latest;
    }

    private ListView list() {
        return dialog.findViewById(R.id.picker_list);
    }

    private View empty() {
        return dialog.findViewById(R.id.picker_empty);
    }

    private TextInputEditText search() {
        return dialog.findViewById(R.id.picker_search);
    }

    private int count() {
        ListAdapter adapter = list().getAdapter();
        return adapter == null ? -1 : adapter.getCount();
    }

    private void type(String text) {
        search().setText(text);
        ShadowLooper.idleMainLooper();
    }

    private void tapRow(int position) {
        list().performItemClick(null, position, position);
        ShadowLooper.idleMainLooper();
    }

    private void save() {
        dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).performClick();
        ShadowLooper.idleMainLooper();
    }

    private Set<String> savedPrefs() {
        Set<String> raw = ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE)
                .getStringSet(PREF_APPS, null);
        return raw == null ? new HashSet<String>() : new HashSet<>(raw);
    }

    private Set<String> savedAllowed() {
        return new HashSet<>(Arrays.asList(PhoneControl.allowedPackages()));
    }

    @Test
    public void listsEveryAppWithNothingTyped() {
        openPicker();
        assertEquals(LABELS.size(), count());
        assertEquals(View.GONE, empty().getVisibility());
    }

    @Test
    public void searchesByAppName() {
        openPicker();
        type("微信");
        assertEquals(1, count());
        assertEquals("微信", list().getAdapter().getItem(0));
        assertEquals(View.GONE, empty().getVisibility());
    }

    @Test
    public void searchesByPackageFragment() {
        openPicker();
        type("oneplus");
        assertEquals(2, count());
        type("alipaygphone");
        assertEquals(1, count());
        assertEquals("支付宝", list().getAdapter().getItem(0));
    }

    @Test
    public void ignoringCaseAndSurroundingSpace() {
        openPicker();
        type("  COM.TENCENT ");
        assertEquals(1, count());
        assertEquals("微信", list().getAdapter().getItem(0));
    }

    @Test
    public void clearingTheBoxBringsEverythingBack() {
        openPicker();
        type("微信");
        assertEquals(1, count());
        type("");
        assertEquals(LABELS.size(), count());
    }

    @Test
    public void noMatchShowsTheEmptyLineAndDoesNotCrash() {
        openPicker();
        type("没有这个应用");
        assertEquals(0, count());
        assertEquals(View.VISIBLE, empty().getVisibility());
        type("微信");
        assertEquals(View.GONE, empty().getVisibility());
        assertEquals(1, count());
    }

    @Test
    public void tickedAppsSurviveAnotherSearch() {
        openPicker();
        type("微信");
        tapRow(0);
        type("相机");
        assertEquals(1, count());
        tapRow(0);
        save();

        assertEquals(new HashSet<>(Arrays.asList("com.tencent.mm", "com.oneplus.camera")), savedAllowed());
        assertEquals(new HashSet<>(Arrays.asList("com.tencent.mm", "com.oneplus.camera")), savedPrefs());
    }

    @Test
    public void tappingAgainUnticksAndDoesNotGetSaved() {
        openPicker();
        type("微信");
        // 勾一下再点一下，等于没勾
        tapRow(0);
        tapRow(0);
        save();
        assertTrue(savedAllowed().isEmpty());
        assertTrue(savedPrefs().isEmpty());
    }

    @Test
    public void existingAllowListComesBackTicked() {
        rememberAllowed("com.tencent.mm");
        openPicker();
        ListAdapter adapter = list().getAdapter();
        android.widget.CheckedTextView first = (android.widget.CheckedTextView)
                adapter.getView(0, null, list());
        assertTrue("已允许的应该在打开时就勾着", first.isChecked());
        android.widget.CheckedTextView second = (android.widget.CheckedTextView)
                adapter.getView(1, null, list());
        assertFalse(second.isChecked());
    }

    @Test
    public void tickingAnAlreadyAllowedAppRemovesIt() {
        rememberAllowed("com.tencent.mm");
        openPicker();
        type("微信");
        tapRow(0);
        save();
        assertTrue(savedAllowed().isEmpty());
        assertTrue(savedPrefs().isEmpty());
    }

    @Test
    public void saveButtonKeepsOldTicksAndAddsNewOnes() {
        rememberAllowed("com.tencent.mm");
        openPicker();
        type("相机");
        tapRow(0);
        save();

        // 点「保存」时看到的是「微信 + 相机」两个，旧勾选也带上了
        assertEquals(new HashSet<>(Arrays.asList("com.tencent.mm", "com.oneplus.camera")), savedAllowed());
        assertEquals(new HashSet<>(Arrays.asList("com.tencent.mm", "com.oneplus.camera")), savedPrefs());
    }

    @Test
    public void clearButtonMeansNoRestriction() {
        rememberAllowed("com.tencent.mm", "com.oneplus.camera");
        openPicker();
        dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_NEUTRAL).performClick();
        ShadowLooper.idleMainLooper();

        assertTrue(savedAllowed().isEmpty());
        assertTrue(savedPrefs().isEmpty());
    }

    @Test
    public void cancelKeepsTheOldList() {
        rememberAllowed("com.tencent.mm");
        openPicker();
        type("相机");
        tapRow(0);
        dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_NEGATIVE).performClick();
        ShadowLooper.idleMainLooper();

        assertEquals(new HashSet<>(Arrays.asList("com.tencent.mm")), savedAllowed());
        assertEquals(new HashSet<>(Arrays.asList("com.tencent.mm")), savedPrefs());
    }

    /** 弹窗得先量一遍才有尺寸：ListView 没有可见区就没法谈「第一行是谁」。 */
    private void layoutDialog() {
        View decor = dialog.getWindow().getDecorView();
        int w = activity.getResources().getDisplayMetrics().widthPixels;
        int h = activity.getResources().getDisplayMetrics().heightPixels;
        decor.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.AT_MOST),
                View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.AT_MOST));
        decor.layout(0, 0, decor.getMeasuredWidth(), decor.getMeasuredHeight());
    }

    /**
     * 列表翻到一半再搜：回到第一行。几百个应用的手机上，筛完还停在原来的滚动位置，
     * 屏幕上就是一片空白，看起来像搜索坏了。
     */
    @Test
    public void searchingGoesBackToTheTopOfTheList() {
        List<String> labels = new java.util.ArrayList<>();
        List<String> packages = new java.util.ArrayList<>();
        for (int i = 0; i < 60; i++) {
            labels.add("测试应用 " + i);
            packages.add("com.example.app" + i);
        }
        openPicker(labels, packages);

        layoutDialog();
        ListView list = list();
        assertEquals(60, list.getAdapter().getCount());
        list.setSelection(20);
        layoutDialog();
        assertTrue("先得真的滚下去过", list.getFirstVisiblePosition() > 0);

        // 这个搜索词能命中全部 60 个：不回到顶部的话，看到的还是第 20 行往后
        type("测试应用");
        layoutDialog();
        assertEquals(0, list.getFirstVisiblePosition());
    }

    /** 「保存」上带着已勾的数量，勾一个跳一下，全清回「保存」。 */
    @Test
    public void saveButtonShowsHowManyAreTicked() {
        rememberAllowed("com.tencent.mm");
        openPicker();
        android.widget.Button save = dialog.getButton(
                androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE);
        assertEquals("保存（1）", save.getText().toString());

        type("相机");
        tapRow(0);
        assertEquals("保存（2）", save.getText().toString());

        type("微信");
        tapRow(0);
        assertEquals("保存（1）", save.getText().toString());

        type("");
        // 现在列表里只剩「相机」还勾着，再点一下就一个不剩
        tapRow(2);
        assertEquals("保存", save.getText().toString());
    }

    @Test
    public void searchBoxCarriesTheHint() {
        openPicker();
        com.google.android.material.textfield.TextInputLayout box =
                dialog.findViewById(R.id.picker_search_box);
        assertNotNull(box);
        assertEquals(activity.getString(R.string.row_control_apps_search),
                String.valueOf(box.getHint()));
    }
}
