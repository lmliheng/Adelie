package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.util.List;

/**
 * 「准备检查」：无障碍、通知、电池优化、安装未知应用这四件事查得准不准，
 * 以及点下去是不是真的送到对应的系统页面。
 *
 * <p>这四项错了的后果不一样：无障碍没开功能全废、通知没开人看不见进度、
 * 电池被优化服务会被杀、未知来源没开更新装不上。所以每项都要单独锁。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class SetupChecksTest {

    private Context ctx;

    @Before
    public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        Settings.Secure.putString(ctx.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, null);
        shadowOf((NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE))
                .setNotificationsEnabled(true);
        shadowOf((PowerManager) ctx.getSystemService(Context.POWER_SERVICE))
                .setIgnoringBatteryOptimizations(ctx.getPackageName(), false);
        shadowOf(ctx.getPackageManager()).setCanRequestPackageInstalls(false);
    }

    private void enableAccessibility(String value) {
        Settings.Secure.putString(ctx.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, value);
    }

    @Test
    public void accessibilityIsOffWhenNothingIsEnabled() {
        assertFalse(SetupChecks.accessibilityOn(ctx));
        enableAccessibility("");
        assertFalse(SetupChecks.accessibilityOn(ctx));
        enableAccessibility("com.other.app/com.other.app.SomeService");
        assertFalse(SetupChecks.accessibilityOn(ctx));
    }

    @Test
    public void accessibilityIsOnWhenOurServiceIsEnabled() {
        enableAccessibility("dev.adelie.app/dev.adelie.app.control.AdelieAccessibilityService");
        assertTrue(SetupChecks.accessibilityOn(ctx));
    }

    /** 系统里那一串可能有好几个服务用 `:` 连起来，短名写法也要认。 */
    @Test
    public void accessibilityRecognisesLongListAndShortName() {
        enableAccessibility("com.other.app/com.other.app.Svc:"
                + "dev.adelie.app/.AdelieAccessibilityService");
        assertTrue(SetupChecks.accessibilityOn(ctx));
    }

    @Test
    public void notificationsFollowTheSystemSwitch() {
        assertTrue(SetupChecks.notificationsOn(ctx));
        shadowOf((NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE))
                .setNotificationsEnabled(false);
        assertFalse(SetupChecks.notificationsOn(ctx));
    }

    @Test
    public void batteryFollowsThePowerManagerWhitelist() {
        assertFalse(SetupChecks.batteryUnrestricted(ctx));
        shadowOf((PowerManager) ctx.getSystemService(Context.POWER_SERVICE))
                .setIgnoringBatteryOptimizations(ctx.getPackageName(), true);
        assertTrue(SetupChecks.batteryUnrestricted(ctx));
    }

    @Test
    public void unknownSourcesFollowThePackageManager() {
        assertFalse(SetupChecks.unknownSourcesAllowed(ctx));
        shadowOf(ctx.getPackageManager()).setCanRequestPackageInstalls(true);
        assertTrue(SetupChecks.unknownSourcesAllowed(ctx));
    }

    @Test
    public void allListsTheFourChecksInOrder() {
        List<SetupChecks.Item> all = SetupChecks.all(ctx, null);
        assertEquals(4, all.size());
        assertEquals(SetupChecks.ACCESSIBILITY, all.get(0).key);
        assertEquals(SetupChecks.NOTIFICATIONS, all.get(1).key);
        assertEquals(SetupChecks.BATTERY, all.get(2).key);
        assertEquals(SetupChecks.UNKNOWN_SOURCES, all.get(3).key);
        for (SetupChecks.Item item : all) {
            assertTrue(item.title != 0);
            assertTrue(item.desc != 0);
        }
    }

    @Test
    public void pendingKeepsOnlyWhatIsBlocking() {
        SetupChecks.Probes probes = new SetupChecks.Probes() {
            @Override
            public boolean accessibility(Context c) {
                return true;
            }

            @Override
            public boolean notifications(Context c) {
                return false;
            }

            @Override
            public boolean battery(Context c) {
                return true;
            }

            @Override
            public boolean unknownSources(Context c) {
                return false;
            }
        };
        List<SetupChecks.Item> pending = SetupChecks.pending(ctx, probes);
        assertEquals(2, pending.size());
        assertEquals(SetupChecks.NOTIFICATIONS, pending.get(0).key);
        assertEquals(SetupChecks.UNKNOWN_SOURCES, pending.get(1).key);
    }

    @Test
    public void pendingIsEmptyWhenEverythingIsReady() {
        SetupChecks.Probes allGood = new SetupChecks.Probes() {
            @Override
            public boolean accessibility(Context c) {
                return true;
            }

            @Override
            public boolean notifications(Context c) {
                return true;
            }

            @Override
            public boolean battery(Context c) {
                return true;
            }

            @Override
            public boolean unknownSources(Context c) {
                return true;
            }
        };
        assertTrue(SetupChecks.pending(ctx, allGood).isEmpty());
        assertEquals(4, SetupChecks.all(ctx, allGood).size());
    }

    @Test
    public void intentsPointAtTheRightSystemPages() {
        assertEquals(Settings.ACTION_ACCESSIBILITY_SETTINGS,
                SetupChecks.intentFor(ctx, SetupChecks.ACCESSIBILITY).getAction());

        Intent sound = SetupChecks.intentFor(ctx, SetupChecks.NOTIFICATIONS);
        assertEquals(Settings.ACTION_APP_NOTIFICATION_SETTINGS, sound.getAction());
        assertEquals("dev.adelie.app", sound.getStringExtra(Settings.EXTRA_APP_PACKAGE));

        Intent battery = SetupChecks.intentFor(ctx, SetupChecks.BATTERY);
        assertEquals(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, battery.getAction());
        assertEquals(Uri.parse("package:dev.adelie.app"), battery.getData());

        Intent unknown = SetupChecks.intentFor(ctx, SetupChecks.UNKNOWN_SOURCES);
        assertEquals(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, unknown.getAction());
        assertEquals(Uri.parse("package:dev.adelie.app"), unknown.getData());
    }

    /** 有东西没就绪时，设置页要把那几行摆出来；全就绪就一行「都就绪了」。 */
    @Test
    public void settingsPageShowsOnlyPendingChecks() {
        enableAccessibility("dev.adelie.app/dev.adelie.app.control.AdelieAccessibilityService");
        shadowOf((NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE))
                .setNotificationsEnabled(false);
        shadowOf((PowerManager) ctx.getSystemService(Context.POWER_SERVICE))
                .setIgnoringBatteryOptimizations(ctx.getPackageName(), true);
        shadowOf(ctx.getPackageManager()).setCanRequestPackageInstalls(true);

        org.robolectric.android.controller.ActivityController<MainActivity> c =
                org.robolectric.Robolectric.buildActivity(MainActivity.class).setup();
        MainActivity a = c.get();
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        ((com.google.android.material.bottomnavigation.BottomNavigationView) a.findViewById(R.id.nav))
                .setSelectedItemId(R.id.nav_settings);
        org.robolectric.shadows.ShadowLooper.idleMainLooper();

        // 只有「通知」一项没就绪：设置页上只该出现一个「去开启」
        android.view.View body = a.findViewById(R.id.settings_body);
        assertEquals(1, countText(body, "去开启"));
        assertTrue(findText(body, getStringOf(a, R.string.setup_notifications_desc)));
        assertFalse(findText(body, getStringOf(a, R.string.setup_battery_desc)));
    }

    private String getStringOf(Context ctx, int res) {
        return ctx.getString(res);
    }

    private int countText(android.view.View root, String text) {
        int n = 0;
        if (root instanceof android.widget.TextView) {
            CharSequence value = ((android.widget.TextView) root).getText();
            if (value != null && value.toString().equals(text)) n++;
        }
        if (root instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) root;
            for (int i = 0; i < group.getChildCount(); i++) n += countText(group.getChildAt(i), text);
        }
        return n;
    }

    private boolean findText(android.view.View root, String text) {
        if (root instanceof android.widget.TextView) {
            CharSequence value = ((android.widget.TextView) root).getText();
            if (value != null && value.toString().equals(text)) return true;
        }
        if (root instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) root;
            for (int i = 0; i < group.getChildCount(); i++) {
                if (findText(group.getChildAt(i), text)) return true;
            }
        }
        return false;
    }
}
