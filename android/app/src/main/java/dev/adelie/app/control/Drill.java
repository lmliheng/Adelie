package dev.adelie.app.control;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * 手机操控的一键演练：无障碍 → 读屏 → 等界面稳住 → 找控件 → 截图 → 任务日志，
 * 一步一步说清楚哪一环不行。
 *
 * <p>侧载包出了问题没有 adb、没有 logcat，用户能做的只有「点一下，把结果发给我」。
 * 所以这里不图快、图说得清楚：每一步带一句人话，失败的那一步写清楚是权限、是系统版本，
 * 还是这一屏真的没有那段字。整份结果可以一键复制。
 */
public final class Drill {

    /** 跑一条指令；真机上是 {@link PhoneControl#handle}，单测换成假的。 */
    public interface Runner {
        JSONObject run(JSONObject req);
    }

    /** 一步的结果：成没成、跳没跳过、为什么。 */
    public static final class Step {
        public final String name;
        public final boolean ok;
        public final boolean skipped;
        public final String detail;

        Step(String name, boolean ok, boolean skipped, String detail) {
            this.name = name;
            this.ok = ok;
            this.skipped = skipped;
            this.detail = detail == null ? "" : detail;
        }

        /** 报告里那一行的开头。 */
        public String mark() {
            if (skipped) return "–";
            return ok ? "✓" : "✗";
        }
    }

    private static final String[] AFTER_SCREEN = {"等界面稳住", "找控件", "截图", "任务日志"};
    private static final String[] AFTER_ACCESS = {"读屏", "等界面稳住", "找控件", "截图", "任务日志"};

    private Drill() {
    }

    /** 跑一遍：无障碍没开就直接说清楚，后面的标成跳过，别让人等一串红叉。 */
    public static List<Step> run(Runner runner) {
        List<Step> steps = new ArrayList<>();
        JSONObject status = safe(runner, req("status"));
        boolean access = status != null && status.optBoolean("accessibility");
        if (!access) {
            String why = status != null && !status.optString("message", "").isEmpty()
                    ? status.optString("message")
                    : "没连上：去系统设置里打开「Adelie 手机操控」";
            steps.add(new Step("无障碍", false, false, why));
            skipAll(steps, AFTER_ACCESS, "跳过了：无障碍没开，后面每一步都跑不通");
            return steps;
        }

        String fg = status.optString("foreground", "");
        JSONObject screenInfo = status.optJSONObject("screen");
        StringBuilder head = new StringBuilder("已连上");
        if (!fg.isEmpty()) head.append(" · 前台 ").append(fg);
        if (screenInfo != null) {
            head.append(" · 屏幕 ").append(screenInfo.optInt("width")).append('x')
                    .append(screenInfo.optInt("height"));
        }
        steps.add(new Step("无障碍", true, false, head.toString()));

        JSONObject screen = safe(runner, req("screen"));
        if (screen == null || !screen.optBoolean("ok")) {
            steps.add(new Step("读屏", false, false, whyNot(screen, "没读到界面")));
            skipAll(steps, AFTER_SCREEN, "跳过了：读屏就没成，后面每一步都要靠它");
            return steps;
        }
        steps.add(new Step("读屏", true, false,
                "读到 " + screen.optInt("nodes") + " 个控件"));

        JSONObject still = safe(runner, req("wait", "until", "still", "timeout", 3000));
        boolean steady = still != null && still.optBoolean("stable");
        steps.add(new Step("等界面稳住", still != null && still.optBoolean("ok"), false,
                still == null ? "没有结果"
                        : (steady ? "界面稳住了（" + still.optInt("waited") + " 毫秒）"
                        : whyOr(still, "3 秒内一直有变化（有动画在跑也算正常）"))));

        JSONObject find = safe(runner, req("scroll_to", "text", "设置", "max", 1));
        boolean found = find != null && find.optBoolean("found");
        steps.add(new Step("找控件", found, false, find == null ? "没有结果"
                : (found ? "找到「设置」" + (find.optInt("scrolled") > 0
                        ? "，翻到第 " + find.optInt("scrolled") + " 屏" : "，就在这一屏")
                : whyOr(find, "这一屏里没有「设置」这段字"))));

        JSONObject shot = safe(runner, req("screenshot", "quality", 40));
        boolean shotOk = shot != null && shot.optBoolean("ok");
        String shotDetail;
        if (shotOk) {
            shotDetail = "拿到 " + shot.optInt("width") + "x" + shot.optInt("height")
                    + " 的截图，" + Math.max(1, shot.optInt("bytes") / 1024) + " KB";
        } else if (shot != null && "unsupported".equals(shot.optString("error"))) {
            shotDetail = "这台系统不给截图（Android 10 及以下没有无障碍截图）";
        } else {
            shotDetail = whyNot(shot, "没截到图");
        }
        steps.add(new Step("截图", shotOk, false, shotDetail));

        JSONObject journal = safe(runner, req("journal", "limit", 200));
        int count = journal == null ? 0 : journal.optInt("count");
        steps.add(new Step("任务日志", journal != null && journal.optBoolean("ok"), false,
                count == 0 ? "还没有记录（做完一次操作再看）" : "记着 " + count + " 条步骤"));
        return steps;
    }

    /** 拼成能直接发给人看的一段话：一行一步，前面一个 ✓ / ✗ / –。 */
    public static String report(List<Step> steps) {
        if (steps == null || steps.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (Step step : steps) {
            if (sb.length() > 0) sb.append('\n');
            sb.append(step.mark()).append(' ').append(step.name);
            if (!step.detail.isEmpty()) sb.append('：').append(step.detail);
        }
        return sb.toString();
    }

    /** 几步全过了没有：设置页里那一行可以据此显示「都正常」还是「有一项没过」。 */
    public static boolean allOk(List<Step> steps) {
        if (steps == null) return false;
        for (Step step : steps) {
            if (!step.ok && !step.skipped) return false;
        }
        return !steps.isEmpty();
    }

    private static void skipAll(List<Step> steps, String[] names, String detail) {
        for (String name : names) steps.add(new Step(name, false, true, detail));
    }

    private static JSONObject req(String action, Object... pairs) {
        JSONObject o = new JSONObject();
        try {
            o.put("action", action);
            for (int i = 0; i + 1 < pairs.length; i += 2) {
                o.put(String.valueOf(pairs[i]), pairs[i + 1]);
            }
        } catch (JSONException ignored) {
        }
        return o;
    }

    /** 一条指令炸了也别让整场演练断掉。 */
    private static JSONObject safe(Runner runner, JSONObject req) {
        try {
            return runner == null ? null : runner.run(req);
        } catch (Exception e) {
            JSONObject fail = new JSONObject();
            try {
                fail.put("ok", false);
                fail.put("error", "exception");
                fail.put("message", e.getClass().getSimpleName());
            } catch (JSONException ignored) {
            }
            return fail;
        }
    }

    private static String whyNot(JSONObject out, String fallback) {
        if (out == null) return fallback;
        String message = out.optString("message", "");
        if (!message.isEmpty()) return message;
        String error = out.optString("error", "");
        return error.isEmpty() ? fallback : error;
    }

    /** 有 note 就用 note（wait 这类会写清楚「还在变」），没有就用默认那句。 */
    private static String whyOr(JSONObject out, String fallback) {
        String note = out == null ? "" : out.optString("note", "");
        return note.isEmpty() ? fallback : note;
    }
}
