package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import dev.adelie.app.control.Drill;

/**
 * 「走一遍看看」：把手机操控的每一环挨个跑一次，哪一环不行要说人话。
 *
 * <p>真机上点一下就能跑，这里把每条指令的答复换成写死的 JSON：报告怎么组织、失败在哪停、
 * 哪一步跳过、异常会不会把整场演练打断，都是真代码。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class DrillTest {

    /** 按 action 给答复的假执行端；也能指定某一步抛异常。 */
    private static final class Fake implements Drill.Runner {
        final Map<String, JSONObject> answers = new HashMap<>();
        final List<String> asked = new ArrayList<>();
        String boomOn;

        Fake put(String action, JSONObject out) {
            answers.put(action, out);
            return this;
        }

        @Override
        public JSONObject run(JSONObject req) {
            String action = req.optString("action");
            asked.add(action);
            if (action.equals(boomOn)) throw new IllegalStateException("炸了");
            JSONObject out = answers.get(action);
            return out == null ? new JSONObject() : out;
        }
    }

    private static JSONObject ok(String... pairs) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", true);
            for (int i = 0; i + 1 < pairs.length; i += 2) {
                String key = pairs[i];
                String value = pairs[i + 1];
                if ("nodes".equals(key) || "width".equals(key) || "height".equals(key)
                        || "bytes".equals(key) || "waited".equals(key) || "count".equals(key)) {
                    o.put(key, Integer.parseInt(value));
                } else if ("stable".equals(key) || "found".equals(key)
                        || "accessibility".equals(key)) {
                    o.put(key, Boolean.parseBoolean(value));
                } else {
                    o.put(key, value);
                }
            }
        } catch (Exception ignored) {
        }
        return o;
    }

    private static JSONObject fail(String error, String message) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", false);
            o.put("error", error);
            o.put("message", message);
        } catch (Exception ignored) {
        }
        return o;
    }

    private static Fake happy() {
        JSONObject status = ok("accessibility", "true", "foreground", "com.tencent.mm");
        try {
            status.put("screen", new JSONObject().put("width", 1080).put("height", 2400));
        } catch (Exception ignored) {
        }
        return new Fake()
                .put("status", status)
                .put("screen", ok("nodes", "42"))
                .put("wait", ok("stable", "true", "waited", "820"))
                .put("scroll_to", ok("found", "true", "scrolled", "0"))
                .put("screenshot", ok("width", "1080", "height", "2400", "bytes", "184320"))
                .put("journal", ok("count", "7"));
    }

    @Test
    public void everythingWorksReadsLikeAReceipt() {
        List<Drill.Step> steps = Drill.run(happy());

        assertEquals(6, steps.size());
        assertEquals("无障碍", steps.get(0).name);
        assertTrue(steps.get(0).detail.contains("com.tencent.mm"));
        assertTrue(steps.get(0).detail.contains("1080x2400"));
        assertEquals("读到 42 个控件", steps.get(1).detail);
        assertTrue(steps.get(2).detail.contains("820 毫秒"));
        assertTrue(steps.get(3).detail.contains("找到「设置」"));
        assertTrue(steps.get(4).detail.contains("180 KB"));
        assertEquals("记着 7 条步骤", steps.get(5).detail);
        assertTrue(Drill.allOk(steps));

        String report = Drill.report(steps);
        assertTrue(report.startsWith("✓ 无障碍："));
        assertTrue(report.contains("\n✓ 读屏："));
        assertFalse(report.endsWith("\n"));
    }

    @Test
    public void withoutAccessibilityEverythingElseIsSkipped() {
        Fake fake = new Fake().put("status", ok("accessibility", "false"));

        List<Drill.Step> steps = Drill.run(fake);

        assertEquals(6, steps.size());
        assertFalse(steps.get(0).ok);
        for (int i = 1; i < steps.size(); i++) {
            assertTrue("没开无障碍时后面应该跳过", steps.get(i).skipped);
        }
        assertEquals(1, fake.asked.size()); // 没用的动作别再问
        assertFalse(Drill.allOk(steps));
        assertTrue(Drill.report(steps).contains("– 读屏"));
    }

    @Test
    public void screenFailureSkipsWhatDependsOnIt() {
        Fake fake = happy();
        fake.put("screen", fail("no_window", "没有拿到当前窗口，稍等再试"));

        List<Drill.Step> steps = Drill.run(fake);

        assertEquals(6, steps.size());
        assertTrue(steps.get(0).ok);
        assertFalse(steps.get(1).ok);
        assertEquals("没有拿到当前窗口，稍等再试", steps.get(1).detail);
        for (int i = 2; i < steps.size(); i++) assertTrue(steps.get(i).skipped);
        assertTrue(fake.asked.contains("screen"));
        assertFalse("读屏失败后别再截图瞎跑", fake.asked.contains("screenshot"));
    }

    @Test
    public void oldAndroidScreenshotIsExplainedNotCrashed() {
        Fake fake = happy();
        fake.put("screenshot", fail("unsupported", "Android 11 以下没有无障碍截图"));

        List<Drill.Step> steps = Drill.run(fake);

        Drill.Step shot = steps.get(4);
        assertEquals("截图", shot.name);
        assertFalse(shot.ok);
        assertTrue(shot.detail.contains("Android 10 及以下"));
        assertTrue("截图不行不影响日志那一步", steps.get(5).ok);
    }

    @Test
    public void missingControlIsReportedButTheRunGoesOn() {
        Fake fake = happy();
        fake.put("scroll_to", ok("found", "false", "scrolled", "1"));
        try {
            fake.answers.get("scroll_to").put("note", "滑了 1 屏没找到「设置」：可能根本不在这个列表里");
        } catch (Exception ignored) {
        }

        List<Drill.Step> steps = Drill.run(fake);

        assertFalse(steps.get(3).ok);
        assertTrue(steps.get(3).detail.contains("没找到"));
        assertTrue(steps.get(4).ok);
        assertTrue(Drill.report(steps).contains("✗ 找控件"));
    }

    @Test
    public void anExceptionInOneStepDoesNotEndTheDrill() {
        Fake fake = happy();
        fake.boomOn = "screenshot";

        List<Drill.Step> steps = Drill.run(fake);

        assertEquals(6, steps.size());
        assertFalse(steps.get(4).ok);
        assertEquals("IllegalStateException", steps.get(4).detail);
        assertTrue("后面一步还得跑", steps.get(5).ok);
    }

    @Test
    public void stillChangingIsNotAFailure() {
        Fake fake = happy();
        JSONObject wait = ok("stable", "false");
        try {
            wait.put("note", "等了 3 秒界面还在变：这一屏就是现在的样子");
        } catch (Exception ignored) {
        }
        fake.put("wait", wait);

        List<Drill.Step> steps = Drill.run(fake);

        Drill.Step step = steps.get(2);
        assertTrue("还在变不是错，只是要说清楚", step.ok);
        assertTrue(step.detail.contains("还在变"));
    }

    @Test
    public void allOkIsFalseWhenAnythingFailedOrTheListIsEmpty() {
        assertFalse(Drill.allOk(new ArrayList<Drill.Step>()));
        assertFalse(Drill.allOk(null));
        assertEquals("", Drill.report(null));

        Fake fake = happy();
        fake.put("scroll_to", ok("found", "false"));
        assertFalse(Drill.allOk(Drill.run(fake)));
        assertTrue(Drill.report(Drill.run(happy())).contains("✓ 找控件"));
    }
}
