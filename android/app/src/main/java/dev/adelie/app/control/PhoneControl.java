package dev.adelie.app.control;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 「手机操控」的执行端：读屏、点按、输入、切应用、截图。
 *
 * <p>外形照 dsh-go 那套做的取舍：只走无障碍（不 root、不 Shizuku、不 ADB），
 * 所以能力上限就是 AccessibilityService 能给的那些；每次动作都返回做了什么、
 * 命中哪个控件、边界在哪，模型据此决定下一步，不用靠猜坐标。
 */
public final class PhoneControl {

    /** 一次 dump 最多收集的节点数，防止整棵树上千个节点把上下文撑爆。 */
    private static final int MAX_NODES = 400;
    private static final int TAP_MS = 60;

    /** 认得的指令；先把名字认下来，再判断无障碍开关，报错才不会张冠李戴。 */
    private static final java.util.Set<String> KNOWN = new java.util.HashSet<>(java.util.Arrays.asList(
            "status", "help", "screen", "dump", "tap", "click", "swipe", "scroll", "text", "input",
            "long_press", "longpress", "long", "key", "open", "launch", "apps", "list_apps",
            "screenshot", "shot", "wait", "scroll_to", "scrollto", "task", "journal", "projection",
            "capture", "doctor"));

    /** 一次「任务」：从第一步动作开始，到停止或者 3 分钟没有新动作为止。 */
    static final class Session {
        final long startedAt = System.currentTimeMillis();
        volatile long lastActionAt = startedAt;
        volatile boolean paused;
        volatile boolean allowAll;
        volatile int step;
        /** 这一步没成的次数；回执通知写「N 步没成」，和日志里的红点对得上。 */
        volatile int failed;
        volatile String lastStep = "准备中";
        /** 这一轮最后操作在哪个应用，回执通知里写出来。 */
        volatile String lastApp = "";
    }

    /** 让人点头的通道：默认用浮层确认卡，单测里换成假的。 */
    interface Confirmer {
        ControlOverlay.Answer ask(String reason);
    }

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final long IDLE_MS = 3 * 60 * 1000;

    private static volatile Session session;
    /** 全局默认：新开的一轮任务直接免确认（设置页那个开关）。 */
    private static volatile boolean defaultAllowAll;
    private static volatile Confirmer confirmer = new Confirmer() {
        @Override
        public ControlOverlay.Answer ask(String reason) {
            return ControlOverlay.confirm(reason);
        }
    };

    /** 没有新动作超过 3 分钟就把任务收掉，浮层跟着消失（dsh-go 也是这个规则）。 */
    private static final Runnable IDLE = new Runnable() {
        @Override
        public void run() {
            Session s = session;
            if (s != null && !s.paused
                    && System.currentTimeMillis() - s.lastActionAt > IDLE_MS) {
                endSession("3 分钟没有新动作");
            }
            MAIN.postDelayed(this, 15000);
        }
    };

    private static volatile AdelieAccessibilityService service;
    private static volatile Context appContext;

    /** 允许操作的应用；空集合表示不限制。自己永远允许（不然连 Adelie 自己的界面都动不了）。 */
    private static volatile java.util.Set<String> allowedPackages = java.util.Collections.emptySet();
    /**
     * 用户点过「以后都允许」的应用：这些应用里的普通动作不再弹确认卡。
     * 硬边界（付款、删除、安装…）不受影响，照样问。
     */
    private static final java.util.Set<String> TRUSTED =
            java.util.Collections.synchronizedSet(new java.util.HashSet<String>());
    private static final String PREF_TRUSTED = "control_trusted_apps";
    private static final List<JSONObject> JOURNAL = new ArrayList<>();
    private static final int JOURNAL_MAX = 200;
    private static final String JOURNAL_FILE = "phone-journal.jsonl";
    /** 日志文件超过这个大小就换一份新的，回放页永远只读最后一小段。 */
    private static final long JOURNAL_FILE_MAX = 1024 * 1024;
    /** 回放页读文件时最多往回翻这么多字节。 */
    private static final int JOURNAL_READ_BYTES = 256 * 1024;

    private static final List<AccessibilityNodeInfo> nodes = new ArrayList<>();
    private static volatile String foregroundPackage = "";
    private static volatile String foregroundActivity = "";

    private PhoneControl() {
    }

    // ------------------------------------------------------------------ 生命周期

    static void attach(AdelieAccessibilityService s) {
        service = s;
        ControlOverlay.attach(s);
        MAIN.removeCallbacks(IDLE);
        MAIN.postDelayed(IDLE, 15000);
    }

    static void detach(AdelieAccessibilityService s) {
        if (service != s) return;
        service = null;
        MAIN.removeCallbacks(IDLE);
        endSession("无障碍服务断开");
        ControlOverlay.detach();
    }

    static void onEvent(AccessibilityEvent event) {
        if (event == null) return;
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            CharSequence pkg = event.getPackageName();
            CharSequence cls = event.getClassName();
            if (pkg != null) foregroundPackage = pkg.toString();
            if (cls != null) foregroundActivity = cls.toString();
        }
    }

    public static boolean ready() {
        return service != null;
    }

    /** ControlServer 启动时把应用上下文交进来（授权页要用）。 */
    static void attachContext(Context ctx) {
        appContext = ctx;
    }

    static Context context() {
        return service != null ? service : appContext;
    }

    // ------------------------------------------------------------------ 入口

    /** 处理一条指令，永远不会抛异常，出错也是 JSON。 */
    public static JSONObject handle(JSONObject req) {
        String action = req.optString("action", req.optString("cmd", "")).trim();
        JSONObject out;
        try {
            if (action.isEmpty()) return fail("bad_request", "缺少 action");
            if ("status".equals(action) || "help".equals(action)) return status(action);
            if (!KNOWN.contains(action)) {
                return fail("bad_request", "不认识的 action: " + action + "（可用：" + KNOWN + "）");
            }
            if ("journal".equals(action)) return journal(req);
            if ("projection".equals(action)) return projection(req);
            if ("capture".equals(action)) return capture(req);
            // 自检：就是要能在「无障碍没开」的时候回答为什么，所以放在开关判断之前
            if ("doctor".equals(action)) return doctor();
            // 任务的开始/暂停/停止不依赖读屏能力：无障碍断了也得能把任务停掉
            if ("task".equals(action)) return task(req);
            if (service == null) {
                return fail("accessibility_off",
                        "无障碍服务没开。设置 → 手机操控 → 去开启「Adelie 手机操控」");
            }
            if (!allowedNow()) {
                return fail("app_not_allowed",
                        "「" + appLabel(foregroundPackage) + "」不在允许操作的应用名单里；"
                                + "要操作它请让用户在 设置 → 手机操控 → 允许操作的应用 里勾上");
            }
            if (isPaused()) {
                return fail("paused", "任务已暂停：点屏幕顶部胶囊或通知栏上的「继续」再试");
            }
            ensureSession();
            if ("screen".equals(action) || "dump".equals(action)) out = screen(req);
            else if ("tap".equals(action) || "click".equals(action)) out = tap(req);
            else if ("swipe".equals(action) || "scroll".equals(action)) out = swipe(req);
            else if ("long_press".equals(action) || "longpress".equals(action)
                    || "long".equals(action)) out = longPress(req);
            else if ("text".equals(action) || "input".equals(action)) out = type(req);
            else if ("key".equals(action)) out = key(req);
            else if ("open".equals(action) || "launch".equals(action)) out = open(req);
            else if ("apps".equals(action) || "list_apps".equals(action)) out = apps(req);
            else if ("screenshot".equals(action) || "shot".equals(action)) out = screenshot(req);
            else if ("wait".equals(action)) out = waitFor(req);
            else if ("scroll_to".equals(action) || "scrollto".equals(action)) out = scrollTo(req);
            else out = fail("bad_request", "不认识的 action: " + action);
            record(action, out);
            return out;
        } catch (Exception e) {
            JSONObject boom = fail("exception", e.getClass().getSimpleName() + ": " + e.getMessage());
            record(action, boom);
            return boom;
        }
    }

    // ------------------------------------------------------------------ 后台屏

    /** 后台屏（虚拟显示）上的当前窗口。 */
    private static AccessibilityNodeInfo rootForVirtual() {
        if (!Projection.active() || Build.VERSION.SDK_INT < 30) return null;
        int want = Projection.displayId();
        try {
            for (AccessibilityWindowInfo w : service.getWindows()) {
                if (w.getDisplayId() == want) {
                    AccessibilityNodeInfo root = w.getRoot();
                    if (root != null) return root;
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    /** 后台屏上现在有几个无障碍窗口（自检用）。 */
    public static int virtualWindowCount() {
        if (service == null || !Projection.active() || Build.VERSION.SDK_INT < 30) return -1;
        int want = Projection.displayId();
        int count = 0;
        try {
            for (AccessibilityWindowInfo w : service.getWindows()) {
                if (w.getDisplayId() == want) count++;
            }
        } catch (Exception ignored) {
            return -1;
        }
        return count;
    }

    private static JSONObject projection(JSONObject req) throws Exception {
        String op = req.optString("op", "status");
        if ("grant".equals(op) || "start".equals(op)) {
            Context ctx = context();
            if (ctx == null) return fail("no_context", "应用上下文还没准备好");
            Projection.requestConsent(ctx);
            JSONObject out = Projection.status();
            out.put("next", "系统会弹出「开始录制或投屏」的确认框，点允许后再查 status");
            return out;
        }
        if ("stop".equals(op)) {
            Projection.stop();
            return Projection.status();
        }
        if ("launch".equals(op)) {
            Context ctx = context();
            String pkg = req.optString("package", "");
            if (pkg.isEmpty()) return fail("bad_request", "要给 package");
            if (!allowedToControl(pkg) && !allowedPackages.isEmpty()) {
                return fail("app_not_allowed", "「" + pkg + "」不在允许操作的应用名单里");
            }
            return Projection.launchOnDisplay(ctx, pkg);
        }
        return Projection.status();
    }

    private static JSONObject capture(JSONObject req) throws Exception {
        mark("后台屏截图");
        return Projection.capture(req.optInt("maxWidth", 1080), req.optInt("quality", 70));
    }

    // ------------------------------------------------------------------ 任务日志

    /** 每做一步记一条：回放任务、排「到底点了什么」都靠它。 */
    private static void record(String action, JSONObject result) {
        JSONObject entry = new JSONObject();
        try {
            entry.put("t", System.currentTimeMillis());
            entry.put("action", action);
            entry.put("ok", result != null && result.optBoolean("ok"));
            String error = result == null ? "" : result.optString("error", "");
            if (!error.isEmpty()) entry.put("error", error);
            Session s = session;
            if (s != null) {
                entry.put("step", s.lastStep);
                // 一轮任务的标记：会话开始的那一刻。回放页按它分段，导出也按它排
                entry.put("task", s.startedAt);
                // 回执通知的「N 步没成」和这里的 ok 是同一份判断，别让两处对不上
                if (result == null || !result.optBoolean("ok")) s.failed++;
            }
            entry.put("foreground", foregroundPackage);
        } catch (JSONException ignored) {
        }
        synchronized (JOURNAL) {
            JOURNAL.add(entry);
            while (JOURNAL.size() > JOURNAL_MAX) JOURNAL.remove(0);
        }
        appendJournalFile(entry);
    }

    private static void appendJournalFile(JSONObject entry) {
        if (service == null) return;
        java.io.FileOutputStream out = null;
        try {
            java.io.File dir = new java.io.File(service.getFilesDir(), "adelie/data");
            if (!dir.isDirectory()) return;
            java.io.File file = new java.io.File(dir, JOURNAL_FILE);
            // 只留最近的一段：回放页看的就是最近的步骤，日志别无限长
            if (file.length() > JOURNAL_FILE_MAX) {
                java.io.File older = new java.io.File(dir, JOURNAL_FILE + ".1");
                older.delete();
                file.renameTo(older);
            }
            out = new java.io.FileOutputStream(file, true);
            out.write((entry.toString() + "\n").getBytes("UTF-8"));
        } catch (Exception ignored) {
        } finally {
            if (out != null) {
                try {
                    out.close();
                } catch (java.io.IOException ignored) {
                }
            }
        }
    }

    private static JSONObject journal(JSONObject req) throws JSONException {
        int limit = Math.max(1, Math.min(JOURNAL_MAX, req.optInt("limit", 40)));
        JSONArray arr = new JSONArray();
        synchronized (JOURNAL) {
            int from = Math.max(0, JOURNAL.size() - limit);
            for (int i = from; i < JOURNAL.size(); i++) arr.put(new JSONObject(JOURNAL.get(i).toString()));
        }
        JSONObject out = ok();
        out.put("count", arr.length());
        out.put("entries", arr);
        return out;
    }

    // ------------------------------------------------------------ 日志回放（界面用）

    /**
     * 回放页要的历史：磁盘上那份才是跨重启的完整记录，内存里只有本次运行的 200 条。
     * 磁盘为空（刚装、刚清空）才退回内存。
     */
    public static List<JSONObject> journalEntries(Context ctx, int limit) {
        int cap = Math.max(1, limit);
        List<JSONObject> out = readJournalFile(ctx, cap);
        if (out.isEmpty()) {
            synchronized (JOURNAL) {
                int from = Math.max(0, JOURNAL.size() - cap);
                for (int i = from; i < JOURNAL.size(); i++) {
                    try {
                        out.add(new JSONObject(JOURNAL.get(i).toString()));
                    } catch (JSONException ignored) {
                    }
                }
            }
        }
        return out;
    }

    /** 日志里存的是协议里的英文动作名，界面上给人话。 */
    public static String label(String action) {
        if (action == null) return "";
        String a = action.trim();
        if (a.isEmpty()) return "";
        if ("screen".equals(a) || "dump".equals(a)) return "读屏";
        if ("tap".equals(a) || "click".equals(a)) return "点按";
        if ("swipe".equals(a) || "scroll".equals(a)) return "滑动";
        if ("long_press".equals(a) || "longpress".equals(a) || "long".equals(a)) return "长按";
        if ("text".equals(a) || "input".equals(a)) return "输入文字";
        if ("key".equals(a)) return "按键";
        if ("open".equals(a) || "launch".equals(a)) return "打开应用";
        if ("apps".equals(a) || "list_apps".equals(a)) return "列应用";
        if ("screenshot".equals(a) || "shot".equals(a)) return "截图";
        if ("wait".equals(a)) return "等待";
        if ("scroll_to".equals(a) || "scrollto".equals(a)) return "滑着找";
        if ("task".equals(a)) return "任务";
        if ("journal".equals(a)) return "查日志";
        if ("projection".equals(a)) return "后台屏";
        if ("capture".equals(a)) return "后台屏截图";
        if ("status".equals(a)) return "状态";
        if ("help".equals(a)) return "帮助";
        return a;
    }

    /**
     * 一轮任务（一次会话）的日志。回放页按它分段，导出也按它排 ——
     * 混在一起看只知道「点了 30 下」，分段之后才知道是哪一轮任务翻的车。
     */
    public static final class Task {
        /** 会话开始的时间戳；0 表示这些步骤不属于任何一轮任务（查日志、启停任务本身）。 */
        public final long id;
        public final List<JSONObject> items = new ArrayList<>();
        public int failed;
        public long first;
        public long last;
        private boolean hasFirst;

        Task(long id) {
            this.id = id;
        }

        public int size() {
            return items.size();
        }

        public boolean hasFailure() {
            return failed > 0;
        }
    }

    /**
     * 把按时间排好的条目切成若干轮任务：相邻且 task 相同的算同一轮。
     * 老版本写的日志没有 task 字段，一律归到「不属于某轮任务」那一段，不至于整页散掉。
     */
    public static List<Task> groupTasks(List<JSONObject> entries) {
        List<Task> groups = new ArrayList<>();
        if (entries == null) return groups;
        Task cur = null;
        for (int i = 0; i < entries.size(); i++) {
            JSONObject e = entries.get(i);
            long id = e == null ? 0L : e.optLong("task", 0L);
            if (cur == null || cur.id != id) {
                cur = new Task(id);
                groups.add(cur);
            }
            if (e == null) continue;
            cur.items.add(e);
            if (!e.optBoolean("ok")) cur.failed++;
            long t = e.optLong("t", 0L);
            if (t > 0) {
                if (!cur.hasFirst || t < cur.first) cur.first = t;
                if (t > cur.last) cur.last = t;
                cur.hasFirst = true;
            }
        }
        return groups;
    }

    /** 导出用的文本：一条一行 JSON，和磁盘上那份格式一样，出了问题可以直接比对。 */
    public static String journalText(List<JSONObject> entries) {
        StringBuilder sb = new StringBuilder();
        if (entries != null) {
            for (int i = 0; i < entries.size(); i++) {
                JSONObject e = entries.get(i);
                if (e != null) sb.append(e.toString()).append('\n');
            }
        }
        return sb.toString();
    }

    /**
     * 导出用的完整记录：日志超过 1 MB 会换走一份（`.1`），回放页只读最近 256 KB，
     * 所以导出不能复用 {@link #journalEntries}。这里把换走的那份和当前的整份拼起来，
     * 老的在前面。磁盘上什么都没有（刚装、刚清空）才退回内存里那点。
     */
    public static String journalArchive(Context ctx) {
        StringBuilder sb = new StringBuilder();
        java.io.File file = journalFile(ctx);
        if (file != null) {
            java.io.File dir = file.getParentFile();
            if (dir != null) {
                sb.append(readAll(new java.io.File(dir, JOURNAL_FILE + ".1")));
                sb.append(readAll(file));
            }
        }
        if (sb.length() == 0) {
            synchronized (JOURNAL) {
                for (int i = 0; i < JOURNAL.size(); i++) sb.append(JOURNAL.get(i)).append('\n');
            }
        }
        return sb.toString();
    }

    private static String readAll(java.io.File file) {
        if (file == null || !file.isFile() || file.length() == 0) return "";
        java.io.FileInputStream in = null;
        try {
            in = new java.io.FileInputStream(file);
            byte[] all = new byte[(int) file.length()];
            int off = 0;
            while (off < all.length) {
                int n = in.read(all, off, all.length - off);
                if (n < 0) break;
                off += n;
            }
            return new String(all, 0, off, "UTF-8");
        } catch (Exception e) {
            return "";
        } finally {
            if (in != null) {
                try {
                    in.close();
                } catch (java.io.IOException ignored) {
                }
            }
        }
    }

    /** {总条数, 失败条数}。设置页那一行要一眼看出「有没有出过事」。 */
    public static int[] journalStats(Context ctx) {
        List<JSONObject> all = journalEntries(ctx, 2000);
        int failed = 0;
        for (int i = 0; i < all.size(); i++) {
            if (!all.get(i).optBoolean("ok")) failed++;
        }
        return new int[]{all.size(), failed};
    }

    /** 清空：内存和磁盘一起扔，回放页换个干净的表。 */
    public static void clearJournal(Context ctx) {
        synchronized (JOURNAL) {
            JOURNAL.clear();
        }
        java.io.File f = journalFile(ctx);
        if (f != null && f.isFile()) f.delete();
    }

    private static java.io.File journalFile(Context ctx) {
        Context c = ctx != null ? ctx : appContext;
        if (c == null) return null;
        java.io.File dir = new java.io.File(c.getFilesDir(), "adelie/data");
        return new java.io.File(dir, JOURNAL_FILE);
    }

    /** 日志是追加写的，只读最后一段就够回放；坏行直接跳过，别让一行脏数据废掉整页。 */
    static List<JSONObject> readJournalFile(Context ctx, int limit) {
        List<JSONObject> out = new ArrayList<>();
        java.io.File f = journalFile(ctx);
        if (f == null || !f.isFile() || f.length() == 0) return out;
        java.io.RandomAccessFile raf = null;
        try {
            raf = new java.io.RandomAccessFile(f, "r");
            long length = raf.length();
            long from = Math.max(0, length - JOURNAL_READ_BYTES);
            raf.seek(from);
            byte[] buf = new byte[(int) (length - from)];
            raf.readFully(buf);
            String text = new String(buf, "UTF-8");
            // 从中间开始读的第一行可能是半截，扔掉
            int start = 0;
            if (from > 0) {
                int nl = text.indexOf('\n');
                start = nl < 0 ? text.length() : nl + 1;
            }
            int pos = start;
            List<JSONObject> parsed = new ArrayList<>();
            while (pos < text.length()) {
                int nl = text.indexOf('\n', pos);
                if (nl < 0) nl = text.length();
                String line = text.substring(pos, nl).trim();
                pos = nl + 1;
                if (line.isEmpty()) continue;
                try {
                    parsed.add(new JSONObject(line));
                } catch (JSONException ignored) {
                    // 写到一半的行或者旧格式，跳过
                }
            }
            int begin = Math.max(0, parsed.size() - Math.max(1, limit));
            for (int i = begin; i < parsed.size(); i++) out.add(parsed.get(i));
        } catch (Exception ignored) {
        } finally {
            if (raf != null) {
                try {
                    raf.close();
                } catch (java.io.IOException ignored) {
                }
            }
        }
        return out;
    }

    private static JSONObject status(String action) throws JSONException {
        JSONObject out = new JSONObject();
        out.put("ok", true);
        if ("help".equals(action)) {
            out.put("help", HELP);
            return out;
        }
        out.put("accessibility", service != null);
        out.put("sdk", Build.VERSION.SDK_INT);
        out.put("screenshot", service != null && Build.VERSION.SDK_INT >= 30);
        out.put("foreground", foregroundPackage);
        out.put("activity", foregroundActivity);
        Session s = session;
        out.put("task", s != null);
        out.put("paused", s != null && s.paused);
        out.put("allowAll", s != null && s.allowAll);
        out.put("allowedApps", new JSONArray(allowedPackages()));
        if (s != null) {
            out.put("step", s.step);
            out.put("seconds", (System.currentTimeMillis() - s.startedAt) / 1000);
        }
        if (service != null) {
            DisplayMetrics m = metrics(service);
            JSONObject screen = new JSONObject();
            screen.put("width", m.widthPixels);
            screen.put("height", m.heightPixels);
            screen.put("density", m.density);
            out.put("screen", screen);
        }
        return out;
    }

    /**
     * 自检：一次说清「能不能操作手机、缺哪一样、让用户做什么」。
     *
     * <p>模型第一句通常都会先跑这个；以前没有这一条，它只能去 shell 里试 input / uiautomator，
     * 全被权限挡回来，然后错误地告诉用户「这台 App 没有无障碍」。
     */
    private static JSONObject doctor() throws JSONException {
        JSONObject out = new JSONObject();
        boolean accessibility = service != null;
        boolean control = ControlServer.running();
        Context ctx = context();
        int skills = ctx == null ? 0 : PhoneSkill.installed(ctx);

        out.put("ok", accessibility && control);
        out.put("accessibility", accessibility);
        out.put("control", control);
        out.put("skill", skills);
        out.put("sdk", Build.VERSION.SDK_INT);
        out.put("version", versionName(ctx));
        out.put("foreground", foregroundPackage);
        if (ctx != null && skills > 0) {
            JSONArray dirs = new JSONArray();
            java.util.List<String> list = PhoneSkill.installedAgentDirs(ctx);
            for (int i = 0; i < list.size(); i++) dirs.put(list.get(i));
            out.put("agents", dirs);
        }

        if (!accessibility) {
            out.put("next", "无障碍没开：请用户打开 系统设置 → 无障碍 → 「Adelie 手机操控」"
                    + "（App 里 设置 → 手机操控 也能一键跳过去）。开之前 screen / tap 都会返回 accessibility_off。");
        } else if (!control) {
            out.put("next", "控制口没起来：回到 Adelie 主界面停一下，服务会自动重启；再不行就重启 App。");
        } else {
            out.put("next", "可以操作手机：先 screen 读一屏，看清控件和编号再决定点哪里。");
        }
        out.put("hint", "不要用 shell 里的 input / uiautomator / screencap：那些要 adb 或 root 身份，"
                + "Adelie 以自己的 uid 跑，必然被拒。手机操控只有这一条路。");
        return out;
    }

    private static String versionName(Context ctx) {
        if (ctx == null) return "";
        try {
            return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }

    private static DisplayMetrics metrics(Context ctx) {
        DisplayMetrics m = new DisplayMetrics();
        WindowManager wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
        if (wm != null) wm.getDefaultDisplay().getRealMetrics(m);
        return m;
    }

    // ------------------------------------------------------------------ 任务会话

    /** 每做一步都建/续上会话，浮层跟着刷新。 */
    private static void ensureSession() {
        Session s = session;
        if (s == null) {
            s = new Session();
            s.allowAll = defaultAllowAll;
            session = s;
            // 新一轮开始，上一轮的回执就没用了，别在通知栏里堆着
            TaskNotification.hideReceipt();
        }
        s.lastActionAt = System.currentTimeMillis();
    }

    /** 标记「这一步在做什么」：刷新浮层文字，顺带把空闲计时清零。 */
    private static void mark(String step) {
        Session s = session;
        if (s == null) return;
        s.step++;
        s.lastStep = step;
        s.lastActionAt = System.currentTimeMillis();
        String app = appLabel(foregroundPackage);
        s.lastApp = app;
        ControlOverlay.showCapsule(step, app, s.step, s.startedAt);
        TaskNotification.show(step, app, s.step, s.paused, s.allowAll, s.startedAt);
    }

    static void endSession(String reason) {
        Session s = session;
        session = null;
        if (s != null) s.paused = false;
        // 挂着的确认卡一起作废，别让等着的调用方干等
        ControlOverlay.cancelConfirm();
        ControlOverlay.hideCapsule();
        TaskNotification.hide();
        // 进度通知收走后人往往已经切走了：留一份回执，点开就是这一轮的回放。
        // 只开了个任务头又停掉（一步都没做）不值得打扰。
        if (s != null && s.step > 0) {
            String app = s.lastApp;
            if (app == null || app.isEmpty()) app = appLabel(foregroundPackage);
            TaskNotification.receipt(s.step, s.failed, app);
        }
    }

    public static boolean sessionAlive() {
        return session != null;
    }

    /** 设置允许操作的应用；传空数组表示不限制。 */
    public static void setAllowedPackages(String[] packages) {
        java.util.Set<String> set = new java.util.HashSet<>();
        if (packages != null) {
            for (String p : packages) {
                if (p != null && !p.trim().isEmpty()) set.add(p.trim());
            }
        }
        allowedPackages = set;
    }

    public static String[] allowedPackages() {
        return allowedPackages.toArray(new String[0]);
    }

    /** 空名单 = 不限制；Adelie 自己永远允许。 */
    static boolean allowedToControl(String pkg) {
        if (pkg == null || pkg.isEmpty()) return true;
        java.util.Set<String> set = allowedPackages;
        if (set.isEmpty()) return true;
        if (pkg.equals(selfPackage())) return true;
        return set.contains(pkg);
    }

    private static boolean allowedNow() {
        return allowedToControl(foregroundPackage);
    }

    private static String selfPackage() {
        return service == null ? "" : service.getPackageName();
    }

    public static void setEdgeGlow(boolean on) {
        ControlOverlay.setGlowEnabled(on);
    }

    static boolean isPaused() {
        Session s = session;
        return s != null && s.paused;
    }

    private static boolean allowAll() {
        Session s = session;
        return s != null && s.allowAll;
    }

    /** 通知栏要按它决定按钮写「免确认」还是「恢复确认」。 */
    static boolean allowAllNow() {
        return allowAll();
    }

    /**
     * 通知栏上那个「免确认 / 恢复确认」：只改本轮任务，不动全局默认。
     * 人正在别的应用里忙，不想每一单都点一下确认卡。
     */
    static void toggleAllowAll() {
        Session s = session;
        if (s == null) return;
        s.allowAll = !s.allowAll;
        s.lastActionAt = System.currentTimeMillis();
        String app = appLabel(foregroundPackage);
        ControlOverlay.showCapsule(s.lastStep, app, Math.max(1, s.step), s.startedAt);
        TaskNotification.show(s.lastStep, app, Math.max(1, s.step), s.paused, s.allowAll, s.startedAt);
    }

    static void togglePause() {
        Session s = session;
        if (s == null) return;
        s.paused = !s.paused;
        s.lastActionAt = System.currentTimeMillis();
        String app = appLabel(foregroundPackage);
        String text = s.paused ? "已暂停" : s.lastStep;
        ControlOverlay.showCapsule(text, app, Math.max(1, s.step), s.startedAt);
        TaskNotification.show(text, app, Math.max(1, s.step), s.paused, s.allowAll, s.startedAt);
    }

    static void stopByUser() {
        endSession("你点了停止");
    }

    static String foreground() {
        return foregroundPackage;
    }

    /**
     * 问人要不要做这一步；「本轮免确认」把整轮放开，「以后都允许」把这个应用记下来
     * （这一步照样放行）。包内可见：单测直接喂一个假的 confirmer 进来。
     */
    static ControlOverlay.Answer ask(String reason) {
        Confirmer c = confirmer;
        ControlOverlay.Answer answer = c == null
                ? ControlOverlay.Answer.CANCEL : c.ask(reason);
        Session s = session;
        if (answer == ControlOverlay.Answer.TASK && s != null) s.allowAll = true;
        if (answer == ControlOverlay.Answer.TRUST) trustApp(foregroundPackage);
        if (s != null) s.lastActionAt = System.currentTimeMillis();
        if (answer == null) return ControlOverlay.Answer.CANCEL;
        return answer == ControlOverlay.Answer.TRUST ? ControlOverlay.Answer.ONCE : answer;
    }

    /**
     * 这一步要不要先问人：应用被信任（或本轮已免确认）时只省普通动作，
     * 付款、删除、安装这类硬边界照样返回理由。
     */
    static String confirmReason(String action, JSONObject req, String label, String pkg) {
        return RiskPolicy.reason(action, req, label, allowAll() || trusted(pkg));
    }

    // ------------------------------------------------------- 以后都允许（按应用记）

    /** 从偏好里把「不再追问的应用」读回来；MainActivity 启动时调一次。 */
    public static void loadTrusted(Context ctx) {
        if (ctx == null) return;
        java.util.Set<String> saved = ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE)
                .getStringSet(PREF_TRUSTED, null);
        synchronized (TRUSTED) {
            TRUSTED.clear();
            if (saved != null) TRUSTED.addAll(saved);
        }
    }

    /** 记下这个应用：之后它里面的普通动作不再弹确认卡（硬边界仍然弹）。 */
    public static void trustApp(String pkg) {
        if (pkg == null || pkg.isEmpty()) return;
        TRUSTED.add(pkg);
        Context ctx = context();
        if (ctx == null) return;
        synchronized (TRUSTED) {
            ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE).edit()
                    .putStringSet(PREF_TRUSTED, new java.util.HashSet<>(TRUSTED)).apply();
        }
    }

    static boolean trusted(String pkg) {
        return pkg != null && !pkg.isEmpty() && TRUSTED.contains(pkg);
    }

    /** 清空「不再追问的应用」：之后这些应用里的发送、打开应用又要点头。 */
    public static void clearTrusted() {
        TRUSTED.clear();
        Context ctx = context();
        if (ctx == null) return;
        ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE).edit()
                .remove(PREF_TRUSTED).apply();
    }

    public static int trustedCount() {
        return TRUSTED.size();
    }

    static String[] trustedApps() {
        synchronized (TRUSTED) {
            return TRUSTED.toArray(new String[0]);
        }
    }

    /** 没点头就不做这一步；超时和主动取消在协议里分开，日志里看得出是哪一种。 */
    static JSONObject refused(ControlOverlay.Answer answer) {
        if (answer == ControlOverlay.Answer.TIMEOUT) {
            return fail("confirm_timeout", "等你确认超时了（两分钟没人点），这一步没有执行");
        }
        return fail("cancelled", "你取消了这一步");
    }

    public static void setDefaultAllowAll(boolean allow) {
        defaultAllowAll = allow;
    }

    public static boolean defaultAllowAll() {
        return defaultAllowAll;
    }

    /** 给单测替换确认通道用。 */
    static void setConfirmer(Confirmer c) {
        confirmer = c;
    }

    private static JSONObject task(JSONObject req) throws JSONException {
        String op = req.optString("op", "status");
        if ("start".equals(op)) {
            ensureSession();
            Session s = session;
            s.lastActionAt = System.currentTimeMillis();
            String app = appLabel(foregroundPackage);
            ControlOverlay.showCapsule("任务开始", app, 1, s.startedAt);
            TaskNotification.show("任务开始", app, 1, false, s.allowAll, s.startedAt);
            return taskInfo();
        }
        if ("stop".equals(op)) {
            endSession("任务结束");
            JSONObject out = ok();
            out.put("stopped", true);
            return out;
        }
        return taskInfo();
    }

    private static JSONObject taskInfo() throws JSONException {
        Session s = session;
        JSONObject out = ok();
        out.put("running", s != null);
        if (s == null) return out;
        out.put("paused", s.paused);
        out.put("allowAll", s.allowAll);
        out.put("step", s.step);
        out.put("lastStep", s.lastStep);
        out.put("seconds", (System.currentTimeMillis() - s.startedAt) / 1000);
        out.put("foreground", foregroundPackage);
        return out;
    }

    /** 包名换成能读的应用名，浮层上显示用。 */
    private static String appLabel(String pkg) {
        if (pkg == null || pkg.isEmpty() || service == null) return "";
        try {
            android.content.pm.PackageManager pm = service.getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (Exception e) {
            return pkg;
        }
    }

    // ------------------------------------------------------------------ 读屏

    private static JSONObject screen(JSONObject req) throws JSONException {
        boolean virtual = "virtual".equals(req.optString("display"));
        mark(virtual ? "读后台屏" : "读屏");
        AccessibilityNodeInfo root = virtual ? rootForVirtual() : service.getRootInActiveWindow();
        if (root == null) {
            return fail(virtual ? "no_virtual_window" : "no_window",
                    virtual ? "后台屏上还没有窗口：先 projection {op:\"launch\", package:\"…\"}"
                            : "没有拿到当前窗口，稍等再试");
        }

        List<AccessibilityNodeInfo> flat = new ArrayList<>();
        collect(root, flat, 0);
        return renderScreen(flat, virtual);
    }

    /**
     * 把一屏控件排成模型看的清单，顺手把编号缓存换掉（下次按 index 点就对得上）。
     * 「等界面稳住」和「滑着找」都从手里已有的那份清单渲染，不再多读一次屏。
     */
    private static JSONObject renderScreen(List<AccessibilityNodeInfo> flat, boolean virtual)
            throws JSONException {
        synchronized (nodes) {
            nodes.clear();
            nodes.addAll(flat);
        }

        StringBuilder text = new StringBuilder();
        text.append("# ").append(orEmpty(foregroundPackage)).append(virtual ? "（后台屏）" : "");
        DisplayMetrics m = screenMetrics();
        text.append(" 屏幕 ").append(m.widthPixels).append('x').append(m.heightPixels).append('\n');
        JSONArray json = new JSONArray();
        for (int i = 0; i < flat.size(); i++) {
            AccessibilityNodeInfo n = flat.get(i);
            Rect r = new Rect();
            n.getBoundsInScreen(r);
            String label = label(n);
            text.append('[').append(i).append("] ")
                    .append(shortClass(n.getClassName()))
                    .append(label.isEmpty() ? "" : " \"" + label + "\"")
                    .append(" [").append(r.left).append(',').append(r.top).append(']')
                    .append('[').append(r.right).append(',').append(r.bottom).append(']')
                    .append(flags(n))
                    .append('\n');
            JSONObject o = new JSONObject();
            o.put("i", i);
            o.put("class", orEmpty(n.getClassName()));
            o.put("text", orEmpty(n.getText()));
            o.put("desc", orEmpty(n.getContentDescription()));
            o.put("id", orEmpty(n.getViewIdResourceName()));
            JSONArray b = new JSONArray();
            b.put(r.left);
            b.put(r.top);
            b.put(r.right);
            b.put(r.bottom);
            o.put("bounds", b);
            o.put("clickable", n.isClickable());
            o.put("editable", n.isEditable());
            o.put("scrollable", n.isScrollable());
            json.put(o);
        }

        JSONObject out = new JSONObject();
        out.put("ok", true);
        out.put("foreground", foregroundPackage);
        out.put("display", virtual ? "virtual" : "default");
        out.put("nodes", flat.size());
        out.put("text", text.toString());
        out.put("tree", json);
        // 节点引用不能交出去，缓存供下次按 index 点击
        return out;
    }

    /** 屏幕尺寸；没有上下文（单测）时给 0，别让渲染整条挂掉。 */
    private static DisplayMetrics screenMetrics() {
        Context ctx = context();
        if (ctx == null) return new DisplayMetrics();
        return metrics(ctx);
    }

    private static void collect(AccessibilityNodeInfo node, List<AccessibilityNodeInfo> out, int depth) {
        if (node == null || out.size() >= MAX_NODES) return;
        out.add(node);
        if (depth > 30) return;
        for (int i = 0; i < node.getChildCount(); i++) {
            if (out.size() >= MAX_NODES) return;
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) collect(child, out, depth + 1);
        }
    }

    private static String shortClass(CharSequence cls) {
        String s = orEmpty(cls);
        int dot = s.lastIndexOf('.');
        return dot >= 0 ? s.substring(dot + 1) : s;
    }

    private static String label(AccessibilityNodeInfo n) {
        String t = orEmpty(n.getText()).trim();
        if (!t.isEmpty()) return t.replace('\n', ' ');
        String d = orEmpty(n.getContentDescription()).trim();
        if (!d.isEmpty()) return d.replace('\n', ' ');
        String id = orEmpty(n.getViewIdResourceName());
        if (!id.isEmpty()) return id.substring(id.lastIndexOf('/') + 1);
        String hint = Build.VERSION.SDK_INT >= 26 ? orEmpty(n.getHintText()) : "";
        return hint.isEmpty() ? "" : hint;
    }

    private static String flags(AccessibilityNodeInfo n) {
        StringBuilder sb = new StringBuilder();
        if (n.isClickable()) sb.append('c');
        if (n.isLongClickable()) sb.append('l');
        if (n.isEditable()) sb.append('e');
        if (n.isScrollable()) sb.append('s');
        if (n.isCheckable()) sb.append(n.isChecked() ? 'K' : 'k');
        if (n.isFocused()) sb.append('f');
        return sb.length() == 0 ? "" : " " + sb;
    }

    // ------------------------------------------------------------------ 点按

    private static JSONObject tap(JSONObject req) throws Exception {
        if ("virtual".equals(req.optString("display")) && req.has("x")) {
            return fail("unsupported", "后台屏上不能按坐标点：用 index 或 text 指定控件");
        }
        if (req.has("x") && req.has("y")) {
            float x = (float) req.optDouble("x");
            float y = (float) req.optDouble("y");
            if (!gestureTap(x, y)) return fail("gesture_failed", "系统拒绝了这次手势");
            mark("点坐标 " + Math.round(x) + "," + Math.round(y));
            JSONObject out = ok();
            out.put("tapped", new JSONArray(new double[]{x, y}));
            out.put("how", "gesture");
            return out;
        }

        Tagged target = find(req);
        if (target == null) return fail("not_found", "没有找到匹配的控件");

        AccessibilityNodeInfo clickable = target.node;
        while (clickable != null && !clickable.isClickable()) {
            clickable = clickable.getParent();
        }

        // 真正带文字的多半是可点的那个外层，取不到再退回目标节点自己的标签
        String targetLabel = label(target.node);
        if (targetLabel.isEmpty() && clickable != null) targetLabel = label(clickable);
        // 免确认只省普通动作的点头；付款、删除、安装这类仍然要问
        String why = confirmReason("tap", req, targetLabel, foregroundPackage);
        if (why != null) {
            mark("等你确认：" + why);
            ControlOverlay.Answer answer = ask(why);
            if (answer == ControlOverlay.Answer.CANCEL || answer == ControlOverlay.Answer.TIMEOUT) {
                return refused(answer);
            }
        }
        mark("点「" + (targetLabel.isEmpty()
                ? shortClass(target.node.getClassName()) : targetLabel) + "」");
        String how;
        if (clickable != null && clickable.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
            how = "ACTION_CLICK";
        } else {
            Rect r = new Rect();
            target.node.getBoundsInScreen(r);
            if (r.width() <= 0 || r.height() <= 0) return fail("not_found", "控件没有可点的区域");
            if (!gestureTap(r.exactCenterX(), r.exactCenterY())) {
                return fail("gesture_failed", "系统拒绝了这次手势");
            }
            how = "gesture";
        }

        JSONObject out = ok();
        JSONObject hit = new JSONObject();
        hit.put("index", target.index);
        hit.put("class", orEmpty(target.node.getClassName()));
        hit.put("label", label(target.node));
        out.put("clicked", hit);
        out.put("how", how);
        return out;
    }

    /** 一次查找的结果：节点 + 它在最近一次 dump 里的编号。 */
    private static final class Tagged {
        final AccessibilityNodeInfo node;
        final int index;

        Tagged(AccessibilityNodeInfo node, int index) {
            this.node = node;
            this.index = index;
        }
    }

    private static Tagged find(JSONObject req) throws JSONException {
        boolean anyFilter = req.has("index") || req.has("text") || req.has("desc")
                || req.has("id") || req.has("className");
        if (!anyFilter) return null;

        // 用最近一次 dump 的快照，编号和模型看到的对得上
        if (nodes.isEmpty()) {
            AccessibilityNodeInfo root = service.getRootInActiveWindow();
            if (root == null) return null;
            List<AccessibilityNodeInfo> flat = new ArrayList<>();
            collect(root, flat, 0);
            synchronized (nodes) {
                nodes.clear();
                nodes.addAll(flat);
            }
        }

        List<AccessibilityNodeInfo> snapshot;
        synchronized (nodes) {
            snapshot = new ArrayList<>(nodes);
        }
        int index = req.has("index") ? req.optInt("index", -1) : -1;
        if (index >= 0 && index < snapshot.size()) {
            AccessibilityNodeInfo n = snapshot.get(index);
            n.refresh();
            if (matches(n, req)) return new Tagged(n, index);
        }

        return pick(snapshot, req);
    }

    /**
     * 在一份读屏快照里挑最像的那个：多个命中时先可点、再面积小，点最具体的那个。
     * 点按与「等界面」共用这一套口径，模型学的规矩才对得上。
     */
    private static Tagged pick(List<AccessibilityNodeInfo> snapshot, JSONObject req) {
        List<Tagged> hits = new ArrayList<>();
        for (int i = 0; i < snapshot.size(); i++) {
            AccessibilityNodeInfo n = snapshot.get(i);
            if (!matches(n, req)) continue;
            hits.add(new Tagged(n, i));
        }
        if (hits.isEmpty()) return null;
        if (hits.size() == 1) return hits.get(0);

        Collections.sort(hits, new Comparator<Tagged>() {
            @Override
            public int compare(Tagged a, Tagged b) {
                if (a.node.isClickable() != b.node.isClickable()) return a.node.isClickable() ? -1 : 1;
                Rect ra = new Rect();
                Rect rb = new Rect();
                a.node.getBoundsInScreen(ra);
                b.node.getBoundsInScreen(rb);
                long sa = (long) ra.width() * ra.height();
                long sb = (long) rb.width() * rb.height();
                return Long.compare(sa, sb);
            }
        });
        return hits.get(0);
    }

    private static boolean matches(AccessibilityNodeInfo n, JSONObject req) {
        String text = req.optString("text", "");
        String desc = req.optString("desc", "");
        String id = req.optString("id", "");
        String cls = req.optString("className", "");
        boolean exact = req.optBoolean("exact", false);

        if (!cls.isEmpty()) {
            String c = orEmpty(n.getClassName());
            if (!c.equals(cls) && !c.endsWith("." + cls)) return false;
        }
        if (!id.isEmpty()) {
            String v = orEmpty(n.getViewIdResourceName());
            if (!v.equals(id) && !v.endsWith(":id/" + id) && !v.endsWith("/" + id)) return false;
        }
        if (!desc.isEmpty()) {
            String v = orEmpty(n.getContentDescription());
            if (!(exact ? v.equals(desc) : v.contains(desc))) return false;
        }
        if (!text.isEmpty()) {
            String v = orEmpty(n.getText());
            String v2 = desc.isEmpty() ? orEmpty(n.getContentDescription()) : "";
            boolean hit = exact ? (v.equals(text) || v2.equals(text))
                    : (v.contains(text) || v2.contains(text) || label(n).contains(text));
            if (!hit) return false;
        }
        return true;
    }

    // ------------------------------------------------------------------ 手势

    private static boolean gestureTap(float x, float y) throws InterruptedException {        Path path = new Path();
        path.moveTo(x, y);
        GestureDescription.StrokeDescription stroke =
                new GestureDescription.StrokeDescription(path, 0, TAP_MS);
        return dispatch(new GestureDescription.Builder().addStroke(stroke).build());
    }

    /** 拖动一段：滑动、滑着找共用。 */
    private static boolean gestureSwipe(float x1, float y1, float x2, float y2, int ms)
            throws InterruptedException {
        Path path = new Path();
        path.moveTo(x1, y1);
        path.lineTo(x2, y2);
        GestureDescription.StrokeDescription stroke =
                new GestureDescription.StrokeDescription(path, 0, Math.max(50, ms));
        return dispatch(new GestureDescription.Builder().addStroke(stroke).build());
    }

    private static boolean dispatch(GestureDescription gesture) throws InterruptedException {
        return dispatch(gesture, 3000);
    }

    private static boolean dispatch(GestureDescription gesture, long timeoutMs)
            throws InterruptedException {
        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicReference<Boolean> done = new AtomicReference<>(false);
        boolean accepted = service.dispatchGesture(gesture, new AccessibilityService.GestureResultCallback() {
            @Override
            public void onCompleted(GestureDescription g) {
                done.set(true);
                latch.countDown();
            }

            @Override
            public void onCancelled(GestureDescription g) {
                done.set(false);
                latch.countDown();
            }
        }, new Handler(Looper.getMainLooper()));
        if (!accepted) return false;
        latch.await(Math.max(500, timeoutMs), TimeUnit.MILLISECONDS);
        return Boolean.TRUE.equals(done.get());
    }

    private static JSONObject swipe(JSONObject req) throws Exception {
        mark("滑动");
        float x1 = (float) req.optDouble("x1", req.optDouble("x", 0));
        float y1 = (float) req.optDouble("y1", req.optDouble("y", 0));
        float x2 = (float) req.optDouble("x2", x1);
        float y2 = (float) req.optDouble("y2", y1 - 400);
        int ms = req.optInt("duration", 300);
        if (!gestureSwipe(x1, y1, x2, y2, ms)) {
            return fail("gesture_failed", "系统拒绝了这次滑动");
        }
        JSONObject out = ok();
        out.put("swiped", new JSONArray(new double[]{x1, y1, x2, y2}));
        return out;
    }

    /**
     * 长按。很多菜单只藏在长按里（桌面图标、聊天消息、文件），没有这个动作模型就只能干看着。
     *
     * <p>优先对控件发 {@code ACTION_LONG_CLICK}（系统自己知道该弹什么）；节点没声明长按能力时
     * 退回「在控件中心按住不放」，那也一样能叫出菜单。坐标长按走同一条按住不放的路。
     */
    private static JSONObject longPress(JSONObject req) throws Exception {
        int ms = longPressMs(req);
        if (req.has("x") && req.has("y")) {
            if ("virtual".equals(req.optString("display"))) {
                return fail("unsupported", "后台屏上不能按坐标长按：用 index 或 text 指定控件");
            }
            float x = (float) req.optDouble("x");
            float y = (float) req.optDouble("y");
            mark("长按坐标 " + Math.round(x) + "," + Math.round(y) + " · " + ms + "ms");
            if (!gestureHold(x, y, ms)) return fail("gesture_failed", "系统拒绝了这次长按");
            JSONObject out = ok();
            out.put("held", new JSONArray(new double[]{x, y}));
            out.put("ms", ms);
            out.put("how", "gesture");
            return out;
        }

        Tagged target = find(req);
        if (target == null) return fail("not_found", "没有找到匹配的控件");
        AccessibilityNodeInfo clickable = target.node;
        while (clickable != null && !clickable.isLongClickable()) clickable = clickable.getParent();
        String targetLabel = label(target.node);
        if (targetLabel.isEmpty() && clickable != null) targetLabel = label(clickable);
        mark("长按「" + (targetLabel.isEmpty()
                ? shortClass(target.node.getClassName()) : targetLabel) + "」");

        if (clickable != null && clickable.performAction(AccessibilityNodeInfo.ACTION_LONG_CLICK)) {
            JSONObject out = ok();
            out.put("longPressed", targetLabel);
            out.put("ms", ms);
            out.put("how", "ACTION_LONG_CLICK");
            return out;
        }
        Rect r = new Rect();
        target.node.getBoundsInScreen(r);
        if (r.width() <= 0 || r.height() <= 0) {
            // 有虚拟显示时用它的坐标，否则用默认显示的
            return fail("not_found", "控件的可点区域是空的（可能在屏幕外），先滑动到它再长按");
        }
        if (!gestureHold(r.centerX(), r.centerY(), ms)) {
            return fail("gesture_failed", "系统拒绝了这次长按");
        }
        JSONObject out = ok();
        out.put("longPressed", targetLabel);
        out.put("ms", ms);
        out.put("how", "gesture");
        return out;
    }

    /** 长按按住多久：默认 800ms，挡住太短（当点击了）和太长（像卡住）两头。 */
    public static int longPressMs(JSONObject req) {
        int ms = req == null ? 800 : req.optInt("duration", 800);
        return Math.max(400, Math.min(5000, ms));
    }

    /**
     * 在一点上按住不放。GestureDescription 要的是「路径 + 时长」，原地按住在路径上
     * 等于画一个 1px 的小段 —— 手感的区别用户看不出来，系统认的就是「同一个点停住那么久」。
     */
    private static boolean gestureHold(float x, float y, int ms) throws InterruptedException {
        Path path = new Path();
        path.moveTo(x, y);
        path.lineTo(x, y + 1);
        GestureDescription.StrokeDescription stroke =
                new GestureDescription.StrokeDescription(path, 0, Math.max(400, ms));
        return dispatch(new GestureDescription.Builder().addStroke(stroke).build(), ms + 3000L);
    }

    // ------------------------------------------------------------------ 输入 / 按键

    private static JSONObject type(JSONObject req) throws Exception {
        mark("输入文字");
        String text = req.optString("text", "");
        Tagged target = find(req);
        AccessibilityNodeInfo node;
        if (target != null) {
            node = target.node;
        } else {
            AccessibilityNodeInfo root = service.getRootInActiveWindow();
            node = findEditable(root);
        }
        if (node == null) return fail("not_found", "没有找到输入框，先用 tap 点一下输入框再输入");

        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
        boolean done = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
        JSONObject out = ok();
        out.put("text", text);
        out.put("how", done ? "ACTION_SET_TEXT" : "failed");
        if (!done) {
            return fail("set_text_failed", "输入框不接受直接设值，需要先点进去用输入法打");
        }
        return out;
    }

    private static AccessibilityNodeInfo findEditable(AccessibilityNodeInfo node) {
        if (node == null) return null;
        if (node.isEditable() && node.isFocused()) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo found = findEditable(node.getChild(i));
            if (found != null) return found;
        }
        return node.isEditable() ? node : null;
    }

    private static JSONObject key(JSONObject req) throws JSONException {
        mark("按键");
        String name = req.optString("name", "back").toLowerCase(Locale.ROOT);
        // 输入法的「搜索 / 发送 / 回车」不是全局按键，只能发给正在编辑的那个输入框
        if ("enter".equals(name) || "send".equals(name) || "search".equals(name)
                || "ime_enter".equals(name)) {
            return imeEnter(name);
        }
        int action;
        switch (name) {
            case "back":
                action = AccessibilityService.GLOBAL_ACTION_BACK;
                break;
            case "home":
                action = AccessibilityService.GLOBAL_ACTION_HOME;
                break;
            case "recents":
            case "recent":
                action = AccessibilityService.GLOBAL_ACTION_RECENTS;
                break;
            case "notifications":
            case "shade":
                action = AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS;
                break;
            case "quick":
            case "settings_panel":
                action = AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS;
                break;
            default:
                return fail("bad_request", "不认识的键: " + name);
        }
        if (!service.performGlobalAction(action)) return fail("key_failed", "系统拒绝了按键");
        JSONObject out = ok();
        out.put("key", name);
        return out;
    }

    /**
     * 点输入法的「回车 / 搜索 / 发送」。很多界面（微信的搜索框、聊天输入框）只有按这个才能提交，
     * 而界面上根本没有一个可点的「发送」按钮 —— 模型到这一步就卡住了。
     * ACTION_IME_ENTER 是 Android 11（API 30）才有的；更老的系统如实说不支持，别硬点。
     */
    private static JSONObject imeEnter(String name) throws JSONException {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return fail("unsupported",
                    "这台系统（Android " + Build.VERSION.SDK_INT
                            + "）不支持直接按输入法的回车，请点界面上的发送 / 搜索按钮");
        }
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        AccessibilityNodeInfo node = findEditable(root);
        if (node == null) {
            return fail("not_found", "没有正在输入的输入框，先用 tap 点一下输入框再发回车");
        }
        if (!node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId())) {
            return fail("key_failed", "输入法没有接受回车，请点界面上的发送 / 搜索按钮");
        }
        JSONObject out = ok();
        out.put("key", name);
        out.put("how", "ACTION_IME_ENTER");
        return out;
    }

    // ------------------------------------------------------------------ 应用

    private static JSONObject open(JSONObject req) throws Exception {
        String pkg = req.optString("package", "").trim();
        String name = req.optString("name", "").trim();
        if (pkg.isEmpty() && name.isEmpty()) return fail("bad_request", "要 package 或 name");

        List<AppEntry> all = launchable();
        AppEntry hit = null;
        if (!pkg.isEmpty()) {
            for (AppEntry e : all) if (e.pkg.equals(pkg)) hit = e;
        }
        if (hit == null && !name.isEmpty()) {
            String key = name.toLowerCase(Locale.ROOT);
            for (AppEntry e : all) {
                if (e.label.toLowerCase(Locale.ROOT).equals(key)) {
                    hit = e;
                    break;
                }
            }
            if (hit == null) {
                for (AppEntry e : all) {
                    if (e.label.toLowerCase(Locale.ROOT).contains(key)) {
                        hit = e;
                        break;
                    }
                }
            }
        }
        if (hit == null) return fail("not_found", "没找到这个应用: " + (pkg.isEmpty() ? name : pkg));

        if (!allowedToControl(hit.pkg)) {
            return fail("app_not_allowed",
                    "「" + hit.label + "」不在允许操作的应用名单里（设置 → 手机操控 → 允许操作的应用）");
        }
        JSONObject openReq = new JSONObject();
        try {
            openReq.put("name", hit.label);
        } catch (JSONException ignored) {
        }
        String openWhy = confirmReason("open", openReq, null, hit.pkg);
        if (openWhy != null) {
            mark("等你确认：" + openWhy);
            ControlOverlay.Answer answer = ask(openWhy);
            if (answer == ControlOverlay.Answer.CANCEL || answer == ControlOverlay.Answer.TIMEOUT) {
                return refused(answer);
            }
        }
        mark("打开「" + hit.label + "」");

        if ("virtual".equals(req.optString("display"))) {
            mark("在后台屏打开「" + hit.label + "」");
            return Projection.launchOnDisplay(service, hit.pkg);
        }

        Intent intent = service.getPackageManager().getLaunchIntentForPackage(hit.pkg);
        if (intent == null) return fail("not_launchable", hit.pkg + " 没有启动入口");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        service.startActivity(intent);
        JSONObject out = ok();
        out.put("opened", hit.pkg);
        out.put("label", hit.label);
        return out;
    }

    private static JSONObject apps(JSONObject req) throws JSONException {
        mark("列应用");
        String filter = req.optString("filter", "").toLowerCase(Locale.ROOT);
        List<AppEntry> all = launchable();
        if (!filter.isEmpty()) {
            List<AppEntry> kept = new ArrayList<>();
            for (AppEntry e : all) {
                if (e.label.toLowerCase(Locale.ROOT).contains(filter)
                        || e.pkg.toLowerCase(Locale.ROOT).contains(filter)) {
                    kept.add(e);
                }
            }
            all = kept;
        }
        JSONArray arr = new JSONArray();
        for (AppEntry e : all) {
            JSONObject o = new JSONObject();
            o.put("label", e.label);
            o.put("package", e.pkg);
            arr.put(o);
        }
        JSONObject out = ok();
        out.put("count", all.size());
        out.put("apps", arr);
        return out;
    }

    private static final class AppEntry {
        final String label;
        final String pkg;

        AppEntry(String label, String pkg) {
            this.label = label;
            this.pkg = pkg;
        }
    }

    private static List<AppEntry> launchable() {
        PackageManager pm = service.getPackageManager();
        Intent intent = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> list = pm.queryIntentActivities(intent, 0);
        List<AppEntry> out = new ArrayList<>();
        for (ResolveInfo ri : list) {
            String pkg = ri.activityInfo.packageName;
            String label = ri.loadLabel(pm).toString();
            out.add(new AppEntry(label, pkg));
        }
        Collections.sort(out, new Comparator<AppEntry>() {
            @Override
            public int compare(AppEntry a, AppEntry b) {
                return a.label.compareToIgnoreCase(b.label);
            }
        });
        return out;
    }

    // ------------------------------------------------------------------ 截图

    private static JSONObject screenshot(final JSONObject req) throws Exception {
        mark("截图");
        if (Build.VERSION.SDK_INT < 30) {
            return fail("unsupported", "系统低于 Android 11，无障碍截图不可用");
        }
        ControlOverlay.suspendForCapture();
        try {
            Thread.sleep(140);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicReference<Bitmap> shot = new AtomicReference<>();
        final AtomicReference<String> err = new AtomicReference<>("");
        Executor executor = new Executor() {
            @Override
            public void execute(Runnable command) {
                new Thread(command).start();
            }
        };
        service.takeScreenshot(Display.DEFAULT_DISPLAY, executor,
                new AccessibilityService.TakeScreenshotCallback() {
                    @Override
                    public void onSuccess(AccessibilityService.ScreenshotResult result) {
                        try {
                            Bitmap bmp = Bitmap.wrapHardwareBuffer(
                                    result.getHardwareBuffer(), result.getColorSpace());
                            shot.set(bmp == null ? null : bmp.copy(Bitmap.Config.ARGB_8888, false));
                        } catch (Exception e) {
                            err.set(e.getClass().getSimpleName() + ": " + e.getMessage());
                        } finally {
                            latch.countDown();
                        }
                    }

                    @Override
                    public void onFailure(int errorCode) {
                        err.set("screenshot error " + errorCode);
                        latch.countDown();
                    }
                });
        boolean got;
        try {
            got = latch.await(5, TimeUnit.SECONDS);
        } finally {
            ControlOverlay.resumeAfterCapture();
        }
        if (!got) return fail("timeout", "截图超时");
        Bitmap bmp = shot.get();
        if (bmp == null) return fail("screenshot_failed", err.get());

        int maxWidth = req.optInt("maxWidth", 1080);
        if (bmp.getWidth() > maxWidth) {
            int h = Math.round(bmp.getHeight() * (maxWidth / (float) bmp.getWidth()));
            Bitmap scaled = Bitmap.createScaledBitmap(bmp, maxWidth, h, true);
            bmp.recycle();
            bmp = scaled;
        }
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        int quality = req.optInt("quality", 70);
        String format = req.optString("format", "jpeg");
        bmp.compress("png".equals(format) ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG,
                quality, buf);
        byte[] bytes = buf.toByteArray();
        int w = bmp.getWidth();
        int h = bmp.getHeight();
        bmp.recycle();

        JSONObject out = ok();
        out.put("width", w);
        out.put("height", h);
        out.put("format", "png".equals(format) ? "png" : "jpeg");
        out.put("bytes", bytes.length);
        out.put("image", Base64.encodeToString(bytes, Base64.NO_WRAP));
        out.put("note", "image 是 base64；需要看图时先落盘成文件再按图片读");
        return out;
    }

    // ------------------------------------------------------------------ 等界面

    /** 等界面时读屏的来源；单测换成假的，不用真机也能验逻辑。 */
    interface ScreenSource {
        /** 当前界面上的控件（已拉平）；读不到窗口时返回 null。 */
        List<AccessibilityNodeInfo> snapshot();

        /** 当前前台应用的包名。 */
        String foreground();
    }

    /** 一次等界面最多等这么久：再长就该让用户知道模型是不是卡住了。 */
    static final int WAIT_MAX_MS = 20000;
    static final int WAIT_MIN_MS = 200;
    /** 两次读屏之间的间隔，别把无障碍服务读崩。 */
    static final int WAIT_GAP_MIN_MS = 100;
    static final int WAIT_GAP_MAX_MS = 2000;
    /** 不带条件的纯等，最长 5 秒。 */
    private static final int WAIT_NAP_MAX_MS = 5000;

    private static JSONObject waitFor(JSONObject req) throws JSONException {
        boolean virtual = "virtual".equals(req.optString("display"));
        return waitFor(req, liveSource(virtual));
    }

    /** 真机上的读屏来源：每次都从无障碍根节点拉一份新的清单。 */
    private static ScreenSource liveSource(final boolean virtual) {
        return new ScreenSource() {
            @Override
            public List<AccessibilityNodeInfo> snapshot() {
                AccessibilityNodeInfo root =
                        virtual ? rootForVirtual() : service.getRootInActiveWindow();
                if (root == null) return null;
                List<AccessibilityNodeInfo> flat = new ArrayList<>();
                collect(root, flat, 0);
                return flat;
            }

            @Override
            public String foreground() {
                return foregroundPackage;
            }
        };
    }

    /**
     * 等界面：每 {@code interval} 毫秒读一次屏，直到条件成立或超时。
     *
     * <p>手机上的界面是异步的：点了「发送」之后下一屏什么时候出来没有准数，
     * 模型只能 sleep 一段再赌。这里让它等「下一屏的关键字」：<br>
     * {@code wait {"text":"发送"}} 等这段文字出现（口径和 tap 一样）；{@code "gone":true} 等它消失
     * （等加载框、等弹窗关掉）；{@code {"package":"com.tencent.mm"}} 等前台换成某个应用。<br>
     * 超时不算错：返回 {@code ok:true, found:false}，模型可以接着 {@code screen} 看看到哪一屏了。
     * 一个条件都不给时退化成 {@code wait {"ms"}} 纯等（最长 5 秒）。
     */
    static JSONObject waitFor(JSONObject req, ScreenSource src) throws JSONException {
        if ("still".equals(req.optString("until", "").trim())) return waitUntilStill(req, src);
        boolean byNode = req.has("text") || req.has("desc") || req.has("id")
                || req.has("className");
        String pkg = req.optString("package", "").trim();
        if (!byNode && pkg.isEmpty()) return waitNap(req);

        boolean gone = req.optBoolean("gone", false);
        int timeout = Math.min(WAIT_MAX_MS, Math.max(WAIT_MIN_MS,
                req.has("timeout") ? req.optInt("timeout", 8000) : req.optInt("ms", 8000)));
        int gap = Math.min(WAIT_GAP_MAX_MS,
                Math.max(WAIT_GAP_MIN_MS, req.optInt("interval", 250)));

        String target = byNode ? describe(req) : ("前台换成 " + pkg);
        mark("等「" + target + (gone ? "」走开" : "」出现"));

        long start = System.currentTimeMillis();
        int polls = 0;
        while (true) {
            polls++;
            JSONObject hit = null;
            boolean known = true;
            if (byNode) {
                List<AccessibilityNodeInfo> flat = src.snapshot();
                if (flat == null) {
                    // 读不到窗口：既不能说它出现，也不能说它走了，接着等
                    known = false;
                } else {
                    Tagged t = pick(flat, req);
                    if (t != null) hit = describeNode(t.node);
                }
            } else if (pkg.equals(src.foreground())) {
                JSONObject o = new JSONObject();
                o.put("package", pkg);
                o.put("label", appLabel(pkg));
                hit = o;
            }

            long waited = System.currentTimeMillis() - start;
            if (known) {
                if (!gone && hit != null) return waitHit(waited, polls, hit, target, false);
                if (gone && hit == null) return waitHit(waited, polls, null, target, true);
            }
            if (waited >= timeout) {
                JSONObject out = waitMiss(waited, polls, target, gone, known, src.foreground());
                return out;
            }
            if (isPaused()) {
                return fail("paused", "等的时候你按了暂停：点屏幕顶部胶囊或通知栏上的「继续」再试");
            }
            sleep(Math.min(gap, Math.max(1, timeout - waited)));
        }
    }

    /** 命中了：出现模式给命中的那个控件，消失模式说一句它走了。 */
    private static JSONObject waitHit(long waited, int polls, JSONObject hit, String target,
            boolean gone) throws JSONException {
        JSONObject out = ok();
        out.put("waited", waited);
        out.put("polls", polls);
        out.put("found", true);
        if (gone) {
            out.put("gone", true);
            out.put("note", "「" + target + "」已经不在了，可以接着动");
        } else {
            out.put("hit", hit);
            out.put("note", "要对它动手先 screen 拿编号：编号每次读屏都会变");
        }
        return out;
    }

    /** 没等到：这不是错，界面上现在是什么才是模型下一步要看的。 */
    private static JSONObject waitMiss(long waited, int polls, String target, boolean gone,
            boolean known, String foreground) throws JSONException {
        JSONObject out = ok();
        out.put("waited", waited);
        out.put("polls", polls);
        out.put("found", false);
        out.put("foreground", orEmpty(foreground));
        if (!known) {
            out.put("note", "一直没拿到当前窗口（等了 " + (waited / 1000) + " 秒）：先 screen 看看，"
                    + "拿不到就说明这一刻系统没给无障碍界面");
        } else if (gone) {
            out.put("note", "「" + target + "」还在（等了 " + (waited / 1000) + " 秒）：可能卡住了，"
                    + "先 screen 看一眼再决定重试还是换个做法");
        } else {
            out.put("note", "没等到「" + target + "」出现（等了 " + (waited / 1000) + " 秒）："
                    + "先 screen 看看现在停在哪一屏");
        }
        return out;
    }

    /**
     * 等界面稳住：连读两屏，控件清单一样就算稳（间隔至少 {@code settle} 毫秒）。
     *
     * <p>不知道下一屏会出现哪段字的时候（刚打开一个应用、刚提交一个表单），模型只能乱猜关键字；
     * 这一条给的是「等它不再变，把这一屏交给你」—— 返回的形状和 {@code screen} 完全一致，
     * 编号也顺手换成这一屏的，拿到就能点。
     */
    static JSONObject waitUntilStill(JSONObject req, ScreenSource src) throws JSONException {
        int timeout = Math.min(WAIT_MAX_MS, Math.max(WAIT_MIN_MS,
                req.has("timeout") ? req.optInt("timeout", 8000) : 8000));
        int gap = Math.min(WAIT_GAP_MAX_MS,
                Math.max(WAIT_GAP_MIN_MS, req.optInt("interval", 250)));
        int settle = Math.max(0, Math.min(2000, req.optInt("settle", 300)));
        boolean virtual = "virtual".equals(req.optString("display"));
        mark("等界面稳住");

        long start = System.currentTimeMillis();
        int polls = 0;
        String last = null;
        long lastAt = 0;
        List<AccessibilityNodeInfo> current = null;
        while (true) {
            polls++;
            current = src.snapshot();
            long now = System.currentTimeMillis();
            if (current != null) {
                String sig = signature(current);
                if (sig.equals(last) && now - lastAt >= settle) {
                    JSONObject out = renderScreen(current, virtual);
                    out.put("waited", now - start);
                    out.put("polls", polls);
                    out.put("stable", true);
                    return out;
                }
                last = sig;
                lastAt = now;
            }
            long waited = now - start;
            if (waited >= timeout) {
                if (current == null) {
                    return fail("no_window", "一直没拿到当前窗口（等了 " + (waited / 1000) + " 秒）");
                }
                // 一直在变（时钟、倒计时、视频）也算有结果：把眼下的这一屏交出去
                JSONObject out = renderScreen(current, virtual);
                out.put("waited", waited);
                out.put("polls", polls);
                out.put("stable", false);
                out.put("note", "等了 " + (waited / 1000) + " 秒界面还在变：这一屏就是现在的样子，"
                        + "可以接着动，也可能要再等一会儿");
                return out;
            }
            if (isPaused()) {
                return fail("paused", "等的时候你按了暂停：点屏幕顶部胶囊或通知栏上的「继续」再试");
            }
            sleep(Math.min(gap, Math.max(1, timeout - waited)));
        }
    }

    /** 一屏的指纹：控件顺序、类名、文字、描述、位置。比同一屏两次读屏是否一致。 */
    private static String signature(List<AccessibilityNodeInfo> flat) {
        StringBuilder sb = new StringBuilder(flat.size() * 32);
        for (AccessibilityNodeInfo n : flat) {
            Rect r = new Rect();
            n.getBoundsInScreen(r);
            sb.append(orEmpty(n.getClassName())).append('\u0001')
                    .append(orEmpty(n.getText())).append('\u0001')
                    .append(orEmpty(n.getContentDescription())).append('\u0001')
                    .append(r.left).append(',').append(r.top).append(',')
                    .append(r.right).append(',').append(r.bottom).append('\u0002');
        }
        return sb.toString();
    }

    // ------------------------------------------------------------------ 滑着找

    /** 滑一屏的手势；单测换成假的，找的逻辑照样跑。 */
    interface ScrollRunner {
        /** @return 这次滑动有没有被系统接下 */
        boolean scroll(boolean up);
    }

    /** 一次最多滑这么多屏：再长说明东西根本不在这一页，别把用户晾在那儿。 */
    static final int SCROLL_MAX = 10;
    /** 滑完先等界面落定再读屏，太快会读到滚动中的半截清单。 */
    private static final int SCROLL_SETTLE_MS = 350;

    private static JSONObject scrollTo(JSONObject req) throws Exception {
        boolean virtual = "virtual".equals(req.optString("display"));
        final DisplayMetrics m = screenMetrics();
        return scrollTo(req, liveSource(virtual), new ScrollRunner() {
            @Override
            public boolean scroll(boolean up) {
                float x = m.widthPixels / 2f;
                float from = m.heightPixels * (up ? 0.3f : 0.8f);
                float to = m.heightPixels * (up ? 0.8f : 0.3f);
                try {
                    return gestureSwipe(x, from, x, to, 260);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return false;
                }
            }
        });
    }

    /**
     * 滑着找：一屏一屏往下翻，直到某段字出现，返回它的编号 —— 编号就是刚读的这一屏的，
     * 拿到直接 {@code tap {"index":…}}。<br>
     * 长列表（聊天列表、联系人、设置页）里模型按文字找不着时，原来只能自己估着 swipe，
     * 滑几下就丢了上下文；这一条把「找不到就往后翻」做成一步。
     */
    static JSONObject scrollTo(JSONObject req, ScreenSource src, ScrollRunner runner)
            throws JSONException {
        boolean byNode = req.has("text") || req.has("desc") || req.has("id")
                || req.has("className");
        if (!byNode) {
            return fail("bad_request", "scroll_to 要说找什么：text / desc / id / className 至少给一个");
        }
        boolean up = "up".equals(req.optString("dir", "down"));
        int max = Math.min(SCROLL_MAX, Math.max(0, req.optInt("max", 4)));
        String target = describe(req);

        int scrolled = 0;
        while (true) {
            List<AccessibilityNodeInfo> flat = src.snapshot();
            if (flat == null) return fail("no_window", "没有拿到当前窗口，稍等再试");
            // 编号缓存跟着这次读屏走，返回的 index 下一步点得动
            synchronized (nodes) {
                nodes.clear();
                nodes.addAll(flat);
            }
            Tagged hit = pick(flat, req);
            if (hit != null) {
                JSONObject out = ok();
                out.put("found", true);
                out.put("scrolled", scrolled);
                out.put("index", hit.index);
                out.put("hit", describeNode(hit.node));
                out.put("note", "编号就是这一屏的：直接 tap {\"index\":" + hit.index + "}");
                return out;
            }
            if (scrolled >= max) {
                JSONObject out = ok();
                out.put("found", false);
                out.put("scrolled", scrolled);
                out.put("nodes", flat.size());
                out.put("note", "滑了 " + scrolled + " 屏没找到「" + target + "」：可能根本不在这个列表里，"
                        + "换个说法、反向找（dir:\"up\"）或者先 screen 看看");
                return out;
            }
            if (isPaused()) {
                return fail("paused", "找的时候你按了暂停：点屏幕顶部胶囊或通知栏上的「继续」再试");
            }
            mark("滑着找「" + target + "」第 " + (scrolled + 1) + " 屏");
            if (!runner.scroll(up)) return fail("gesture_failed", "系统拒绝了这次滑动");
            scrolled++;
            sleep(SCROLL_SETTLE_MS);
        }
    }

    /**
     * 等的是哪段字：先看 text，再看描述、id、类名，写给胶囊和提示用。
     */
    private static String describe(JSONObject req) {
        String text = req.optString("text", "");
        if (!text.isEmpty()) return text;
        String desc = req.optString("desc", "");
        if (!desc.isEmpty()) return desc;
        String id = req.optString("id", "");
        if (!id.isEmpty()) return id;
        return shortClass(req.optString("className", ""));
    }

    /** 命中的节点对外只说特征和位置，节点引用不能交出去。 */
    private static JSONObject describeNode(AccessibilityNodeInfo n) throws JSONException {
        Rect r = new Rect();
        n.getBoundsInScreen(r);
        JSONObject o = new JSONObject();
        o.put("class", orEmpty(n.getClassName()));
        o.put("text", orEmpty(n.getText()));
        o.put("desc", orEmpty(n.getContentDescription()));
        o.put("id", orEmpty(n.getViewIdResourceName()));
        o.put("label", label(n));
        JSONArray b = new JSONArray();
        b.put(r.left);
        b.put(r.top);
        b.put(r.right);
        b.put(r.bottom);
        o.put("bounds", b);
        o.put("clickable", n.isClickable());
        return o;
    }

    private static void sleep(long ms) {
        if (ms <= 0) return;
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    // ------------------------------------------------------------------ 杂项

    /** 纯等一会儿：老用法 wait {ms}，最长 5 秒。 */
    private static JSONObject waitNap(JSONObject req) throws JSONException {
        int ms = Math.min(WAIT_NAP_MAX_MS, Math.max(0, req.optInt("ms", 400)));
        sleep(ms);
        JSONObject out = ok();
        out.put("waited", ms);
        return out;
    }

    private static JSONObject ok() {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", true);
        } catch (JSONException ignored) {
        }
        return o;
    }

    private static JSONObject fail(String code, String message) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", false);
            o.put("error", code);
            o.put("message", message == null ? "" : message);
        } catch (JSONException ignored) {
        }
        return o;
    }

    private static String orEmpty(CharSequence s) {
        return s == null ? "" : s.toString();
    }

    static final String HELP =
            "Adelie 手机操控（无障碍）\n"
                    + "POST /cmd  {\"action\":...}\n"
                    + "  doctor                 自检：无障碍/控制口/技能装没装，缺哪样、下一步怎么办（不能操作时也答得出）\n"
                    + "  status                 当前状态、前台应用、屏幕尺寸\n"
                    + "  screen                 读当前界面：text 为带编号的控件清单，tree 为结构化节点\n"
                    + "  tap {index|text|desc|id|className|exact}  点控件；也可 {x,y} 直接点坐标\n"
                    + "  swipe {x1,y1,x2,y2,duration}\n"
                    + "  long_press {index|text|desc|id|exact}  长按控件（叫出菜单）；也可 {x,y,duration?}\n"
                    + "  text {text, index?}    往输入框里写字\n"
                    + "  key {name: back|home|recents|notifications|quick|enter}  enter 是输入法的回车/发送\n"
                    + "  open {package|name}    打开应用\n"
                    + "  apps {filter?}         可启动的应用清单\n"
                    + "  screenshot {quality?,format?}  Android 11+ 截图，返回 base64\n"
                    + "  wait {until:\"still\"}      等界面不再变，直接把这一屏（带编号）交出来\n"
                    + "  wait {ms}              纯等一会儿（最长 5 秒）\n"
                    + "  wait {text|desc|id, timeout?, interval?, gone?}  等某个控件出现（gone 等它消失），"
                    + "默认最多 8 秒、上限 20 秒；wait {package} 等前台换应用；没等到返回 found:false\n"
                    + "  scroll_to {text|desc|id, max?, dir?}  一屏一屏往后翻着找，找到给编号；max 默认 4、上限 10\n"
                    + "  task {op: start|stop|status}  开/停一轮手机任务（浮层出现与消失）\n"
                    + "\n"
                    + "发送、删除、付款、开新应用这类动作会先在屏幕上弹出确认卡，"
                    + "用户点「允许一次 / 本轮免确认 / 取消」后这次请求才返回；"
                    + "取消返回 error=cancelled，停掉浮层后返回 error=accessibility_off。\n"
                    + "一轮任务 3 分钟没有新动作会自动结束。\n";
}
