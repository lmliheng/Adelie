package dev.adelie.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;

import org.json.JSONObject;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import dev.adelie.app.control.PhoneControl;
import dev.adelie.app.control.Projection;

/**
 * 诊断包：把「出问题时最常要问的那几样」打成一个文本文件发出来 ——
 * 版本、设备、准备检查的现状、手机操控的状态、最近的运行日志与任务日志。
 *
 * <p>手机上没法截图给开发者看 logcat，也没有 adb。人只要在设置里点一下，
 * 就能把这个文件发到微信或邮件里；比来回问「你那边无障碍开了吗」「版本是多少」快得多。
 *
 * <p>这里只读、不写应用状态，也不含密码与验证码 —— 运行日志里本来就没有这些东西。
 */
final class Diagnostics {

    /** 运行日志留最后这么多行：够看出启动、解包、监听、重启这些事，又不至于几兆。 */
    static final int LOG_LINES = 120;
    /** 任务日志留最后这么多条。 */
    static final int JOURNAL_LINES = 100;

    private Diagnostics() {
    }

    static String fileName(long now) {
        return "adelie-diagnostics-"
                + new SimpleDateFormat("yyyyMMdd-HHmm", Locale.US).format(new Date(now)) + ".txt";
    }

    /** 整份报告。任何一段读不出来都只写一行「读不到」，不抛异常 —— 诊断工具自己不能崩。 */
    static String text(Context ctx) {
        StringBuilder sb = new StringBuilder(8192);
        sb.append("Adelie 诊断包\n");
        sb.append("生成时间：").append(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
                .format(new Date())).append('\n');

        app(ctx, sb);
        crash(ctx, sb);
        setup(ctx, sb);
        control(ctx, sb);
        runtimeLog(sb);
        journal(ctx, sb);
        return sb.toString();
    }

    private static void app(Context ctx, StringBuilder sb) {
        sb.append("\n== 应用 ==\n");
        try {
            PackageInfo info = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            sb.append("版本：").append(info.versionName).append("（").append(info.versionCode)
                    .append("）\n");
        } catch (Exception e) {
            sb.append("版本：读不到（").append(e.getClass().getSimpleName()).append("）\n");
        }
        sb.append("包名：").append(ctx.getPackageName()).append('\n');
        sb.append("系统：Android ").append(Build.VERSION.RELEASE)
                .append("（API ").append(Build.VERSION.SDK_INT).append("）\n");
        sb.append("设备：").append(Build.MANUFACTURER).append(' ').append(Build.MODEL).append('\n');
        if (Build.SUPPORTED_ABIS != null && Build.SUPPORTED_ABIS.length > 0) {
            sb.append("ABI：").append(Build.SUPPORTED_ABIS[0]).append('\n');
        }
        sb.append("服务：").append(Core.ready ? "已就绪" : "未就绪")
                .append(Core.baseUrl == null ? "" : " · " + Core.baseUrl)
                .append(Core.phase == null || Core.phase.isEmpty() ? "" : " · " + Core.phase)
                .append('\n');
    }

    /** 上次崩溃的现场：有就整段带上（堆栈是定位问题的关键），没有也写一句。 */
    private static void crash(Context ctx, StringBuilder sb) {
        sb.append("\n== 上次异常退出 ==\n");
        try {
            String text = CrashLog.read(ctx);
            sb.append(text.isEmpty() ? "（没有记录）\n" : text);
        } catch (Exception e) {
            sb.append("读不到：").append(e.getClass().getSimpleName()).append('\n');
        }
    }

    private static void setup(Context ctx, StringBuilder sb) {
        sb.append("\n== 准备检查 ==\n");
        try {
            List<SetupChecks.Item> items = SetupChecks.all(ctx, SetupChecks.REAL);
            for (SetupChecks.Item item : items) {
                sb.append(item.ok ? "[已就绪] " : "[未就绪] ")
                        .append(ctx.getString(item.title)).append('\n');
            }
        } catch (Exception e) {
            sb.append("读不到：").append(e.getClass().getSimpleName()).append('\n');
        }
    }

    private static void control(Context ctx, StringBuilder sb) {
        sb.append("\n== 手机操控 ==\n");
        try {
            JSONObject status = PhoneControl.handle(new JSONObject().put("action", "status"));
            sb.append("无障碍：").append(status.optBoolean("accessibility") ? "已开启" : "未开启")
                    .append('\n');
            sb.append("控制服务：").append(PhoneControl.ready() ? "在" : "不在").append('\n');
            String fg = status.optString("foreground", "");
            sb.append("当前前台：").append(fg.isEmpty() ? "（未知）" : fg).append('\n');
            sb.append("任务：").append(status.optBoolean("task") ? "进行中" : "没有")
                    .append(status.optBoolean("paused") ? " · 已暂停" : "")
                    .append(status.optBoolean("allowAll") ? " · 本轮免确认" : "")
                    .append('\n');
            sb.append("允许操作的应用：");
            org.json.JSONArray apps = status.optJSONArray("allowedApps");
            int n = apps == null ? 0 : apps.length();
            sb.append(n == 0 ? "不限制" : n + " 个").append('\n');
            JSONObject screen = status.optJSONObject("screen");
            if (screen != null) {
                sb.append("屏幕：").append(screen.optInt("width")).append('×')
                        .append(screen.optInt("height")).append('\n');
            }
            sb.append("后台屏：").append(Projection.active() ? "已授权（显示 " + Projection.displayId() + "）"
                    : "未授权").append('\n');
        } catch (Exception e) {
            sb.append("读不到：").append(e.getClass().getSimpleName())
                    .append(e.getMessage() == null ? "" : " " + e.getMessage()).append('\n');
        }
    }

    private static void runtimeLog(StringBuilder sb) {
        sb.append("\n== 最近运行日志（最后 ").append(LOG_LINES).append(" 行）==\n");
        try {
            List<String> lines = Core.lines();
            int from = Math.max(0, lines.size() - LOG_LINES);
            if (lines.isEmpty()) sb.append("（还没有输出）\n");
            for (int i = from; i < lines.size(); i++) {
                sb.append(stripAnsi(lines.get(i))).append('\n');
            }
        } catch (Exception e) {
            sb.append("读不到：").append(e.getClass().getSimpleName()).append('\n');
        }
    }

    private static void journal(Context ctx, StringBuilder sb) {
        sb.append("\n== 最近任务日志（最后 ").append(JOURNAL_LINES).append(" 条）==\n");
        try {
            List<JSONObject> entries = PhoneControl.journalEntries(ctx, JOURNAL_LINES);
            if (entries.isEmpty()) {
                sb.append("（还没有记录）\n");
                return;
            }
            sb.append(PhoneControl.journalText(entries)).append('\n');
        } catch (Exception e) {
            sb.append("读不到：").append(e.getClass().getSimpleName()).append('\n');
        }
    }

    /** node 的输出带 ANSI 颜色，发给别人看不需要这些控制字符。 */
    static String stripAnsi(String line) {
        if (line == null) return "";
        return line.replaceAll("\u001B\\[[0-9;]*[A-Za-z]", "");
    }

    /** 分享意图：纯文本，收件方（微信、邮件、记事本）都认。 */
    static Intent share(Uri uri, String name) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.putExtra(Intent.EXTRA_SUBJECT, name);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return send;
    }

    /** 写文件走 JournalExport 那一套（cache/share，FileProvider 已经放开这一层）。 */
    static File write(Context ctx, String name) throws Exception {
        return JournalExport.writeText(ctx, text(ctx), name);
    }
}
