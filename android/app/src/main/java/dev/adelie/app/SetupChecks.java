package dev.adelie.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import java.util.ArrayList;
import java.util.List;

import dev.adelie.app.control.AdelieAccessibilityService;

/**
 * 侧载包的「准备检查」：这套东西不是装上就能用，得人去系统里放几道行。
 *
 * <p>侧载没有商店帮忙申请权限，国产 ROM 还会额外拿掉后台与电池。最常见的几种「用不了」
 * 其实都不是程序出错：无障碍没开、通知被关、电池优化把服务杀了、更新装不上因为没允许装未知应用。
 * 这里把这四件事查清楚，能直接把人送到对应的系统开关页 —— 比让他在设置里翻三层强。
 *
 * <p>判断逻辑收在 {@link Probes} 后面，单测可以喂假状态；真机上用的是 {@link #REAL}。
 */
final class SetupChecks {

    static final String ACCESSIBILITY = "accessibility";
    static final String NOTIFICATIONS = "notifications";
    static final String BATTERY = "battery";
    static final String UNKNOWN_SOURCES = "unknown_sources";

    /** 四项各自怎么判断。抽出来是为了单测能喂任意组合，不用去改系统状态。 */
    interface Probes {
        boolean accessibility(Context ctx);

        boolean notifications(Context ctx);

        boolean battery(Context ctx);

        boolean unknownSources(Context ctx);
    }

    static final Probes REAL = new Probes() {
        @Override
        public boolean accessibility(Context ctx) {
            return accessibilityOn(ctx);
        }

        @Override
        public boolean notifications(Context ctx) {
            return notificationsOn(ctx);
        }

        @Override
        public boolean battery(Context ctx) {
            return batteryUnrestricted(ctx);
        }

        @Override
        public boolean unknownSources(Context ctx) {
            return unknownSourcesAllowed(ctx);
        }
    };

    static final class Item {
        final String key;
        final int title;
        final int desc;
        final boolean ok;

        Item(String key, int title, int desc, boolean ok) {
            this.key = key;
            this.title = title;
            this.desc = desc;
            this.ok = ok;
        }
    }

    private SetupChecks() {
    }

    /** 四项按重要程度排好（无障碍最要紧）。 */
    static List<Item> all(Context ctx, Probes probes) {
        List<Item> out = new ArrayList<>();
        if (ctx == null) return out;
        Probes p = probes == null ? REAL : probes;
        out.add(new Item(ACCESSIBILITY, R.string.setup_accessibility,
                R.string.setup_accessibility_desc, p.accessibility(ctx)));
        out.add(new Item(NOTIFICATIONS, R.string.setup_notifications,
                R.string.setup_notifications_desc, p.notifications(ctx)));
        out.add(new Item(BATTERY, R.string.setup_battery,
                R.string.setup_battery_desc, p.battery(ctx)));
        out.add(new Item(UNKNOWN_SOURCES, R.string.setup_unknown_sources,
                R.string.setup_unknown_sources_desc, p.unknownSources(ctx)));
        return out;
    }

    /** 只留还没就绪的 —— 设置页上只摆挡住用的事。 */
    static List<Item> pending(Context ctx, Probes probes) {
        List<Item> out = new ArrayList<>();
        for (Item item : all(ctx, probes)) {
            if (!item.ok) out.add(item);
        }
        return out;
    }

    /** 这一项点下去要去哪个系统页面。 */
    static Intent intentFor(Context ctx, String key) {
        String pkg = ctx == null ? "" : ctx.getPackageName();
        if (NOTIFICATIONS.equals(key)) {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
            return intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        }
        if (BATTERY.equals(key)) {
            // 侧载包不走商店政策，可以直接请系统把本应用放进「不优化」名单
            return new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + pkg));
        }
        if (UNKNOWN_SOURCES.equals(key)) {
            return new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + pkg));
        }
        return new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
    }

    // ------------------------------------------------------------------ 判断

    /**
     * 无障碍是否已经给了我们这个服务。读系统的 `enabled_accessibility_services`
     * （一长串 `包/服务`，用 `:` 分开），比问 AccessibilityManager 更直接，也更好测。
     */
    static boolean accessibilityOn(Context ctx) {
        if (ctx == null) return false;
        try {
            String enabled = Settings.Secure.getString(ctx.getContentResolver(),
                    Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            if (enabled == null || enabled.trim().isEmpty()) return false;
            ComponentName want = new ComponentName(ctx, AdelieAccessibilityService.class);
            String ours = want.flattenToString();
            String oursShort = ctx.getPackageName() + "/." + AdelieAccessibilityService.class.getSimpleName();
            for (String part : enabled.split(":")) {
                String one = part.trim();
                if (one.equalsIgnoreCase(ours) || one.equalsIgnoreCase(oursShort)) return true;
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    static boolean notificationsOn(Context ctx) {
        if (ctx == null) return true;   // 查不出来就当没事，别平白吓人
        try {
            android.app.NotificationManager nm = (android.app.NotificationManager)
                    ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            return nm == null || nm.areNotificationsEnabled();
        } catch (Exception e) {
            return true;
        }
    }

    static boolean batteryUnrestricted(Context ctx) {
        if (ctx == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            return pm == null || pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        } catch (Exception e) {
            return true;
        }
    }

    /** 8.0 起装包要先允许「安装未知应用」；更早的系统默认允许。 */
    static boolean unknownSourcesAllowed(Context ctx) {
        if (ctx == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        try {
            return ctx.getPackageManager().canRequestPackageInstalls();
        } catch (Exception e) {
            return true;
        }
    }
}
