package dev.adelie.app.control;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.view.View;
import android.widget.TextView;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.annotation.Config;

import dev.adelie.app.R;

/**
 * 确认卡：「要不要点这一步」那张浮层。真机上它是系统浮层、要无障碍服务在才出得来，
 * 这里锁住两块不需要服务的部分 —— 卡片布局本身，和取消 / 超时在协议里的区别。
 *
 * <p>超时与主动取消分开是有用的：日志里看到 `confirm_timeout` 就知道是「人没在」，
 * 看到 `cancelled` 才是「人不同意」。
 */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
// 文字宽度/高度要真的算出来，小屏适配才量得准（默认的老图形模式里中文宽度是 0）
@org.robolectric.annotation.GraphicsMode(org.robolectric.annotation.GraphicsMode.Mode.NATIVE)
public class ConfirmCardTest {

    @Test
    public void countdownReadsNaturally() {
        assertEquals("2:00", ControlOverlay.countdownText(120));
        assertEquals("1:58", ControlOverlay.countdownText(118));
        assertEquals("1:05", ControlOverlay.countdownText(65));
        assertEquals("59 秒", ControlOverlay.countdownText(59));
        assertEquals("9 秒", ControlOverlay.countdownText(9));
        assertEquals("0 秒", ControlOverlay.countdownText(0));
        assertEquals("0 秒", ControlOverlay.countdownText(-3));
    }

    /** 卡片布局得能撑起来，四个按钮 + 倒计时一行都在。 */
    @Test
    public void cardLayoutHasEverything() {
        MainActivityHost host = new MainActivityHost();
        View card = host.inflate();
        assertNotNull(card.findViewById(R.id.cf_reason));
        assertNotNull(card.findViewById(R.id.cf_allow));
        assertNotNull(card.findViewById(R.id.cf_allow_task));
        assertNotNull(card.findViewById(R.id.cf_allow_app));
        assertNotNull(card.findViewById(R.id.cf_cancel));
        TextView timer = card.findViewById(R.id.cf_timer);
        assertNotNull("确认卡要有一行写多久自动取消", timer);
        assertEquals("取消", ((TextView) card.findViewById(R.id.cf_cancel)).getText().toString());
        assertEquals("本轮免确认", ((TextView) card.findViewById(R.id.cf_allow_task)).getText().toString());
        assertEquals("允许一次", ((TextView) card.findViewById(R.id.cf_allow)).getText().toString());
        assertEquals("以后都允许",
                ((TextView) card.findViewById(R.id.cf_allow_app)).getText().toString());

        String text = host.activity.getString(R.string.control_confirm_timer, "1:58");
        assertEquals("1:58 后自动取消", text);
    }

    @Test
    public void timeoutIsNotTheSameAsCancel() throws Exception {
        JSONObject timeout = PhoneControl.refused(ControlOverlay.Answer.TIMEOUT);
        assertFalse(timeout.getBoolean("ok"));
        assertEquals("confirm_timeout", timeout.optString("error"));
        assertTrue(timeout.optString("message").contains("超时"));

        JSONObject cancel = PhoneControl.refused(ControlOverlay.Answer.CANCEL);
        assertFalse(cancel.getBoolean("ok"));
        assertEquals("cancelled", cancel.optString("error"));
        assertTrue(cancel.optString("message").contains("取消"));
    }

    /** 没有无障碍服务就没有浮层，这时候不能假装用户同意了。 */
    @Test
    public void withoutServiceConfirmFallsBackToCancel() {
        assertEquals(ControlOverlay.Answer.CANCEL, ControlOverlay.confirm("要点「发送」"));
    }

    /** 只为了拿一个带主题的 Context 来 inflate 浮层。 */
    private static final class MainActivityHost {
        final dev.adelie.app.MainActivity activity =
                Robolectric.buildActivity(dev.adelie.app.MainActivity.class).setup().get();

        View inflate() {
            return android.view.LayoutInflater.from(activity)
                    .inflate(R.layout.overlay_confirm, null, false);
        }
    }

    // ------------------------------------------------------------------ 小屏适配

    /** 摆好、量好、排好：单测里没有窗口，得自己走这三步才看得到按钮的真实位置。 */
    private static android.graphics.Rect layoutCard(View card, int widthPx, int maxHeightPx,
                                                     int gapPx) {
        ControlOverlay.fitCard(card, widthPx, maxHeightPx, gapPx);
        card.layout(0, 0, card.getMeasuredWidth(), card.getMeasuredHeight());
        return new android.graphics.Rect(0, 0, card.getWidth(), card.getHeight());
    }

    private static String longReason() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 40; i++) {
            sb.append("第 ").append(i).append(" 步：把这段很长的说明写到昨天那个群里，「发送」之前要再确认一次。");
        }
        return sb.toString();
    }

    private static void assertButtonsInside(View card, android.graphics.Rect box) {
        android.widget.LinearLayout row = card.findViewById(R.id.cf_buttons);
        assertTrue("按钮行要在卡片里", row.getBottom() <= box.height());
        for (int id : new int[]{R.id.cf_cancel, R.id.cf_allow_task, R.id.cf_allow}) {
            View b = card.findViewById(id);
            assertTrue("按钮没被量出来", b.getWidth() > 0 && b.getHeight() > 0);
            assertTrue("按钮跑出卡片右边", b.getRight() <= box.width());
            assertTrue("按钮跑出卡片下边", b.getBottom() <= box.height());
        }
    }

    /** 小屏 + 超长理由：卡片不超出上限，文字区缩起来滚动，三个按钮还完整可见。 */
    @Test
    public void cardFitsASmallScreenWithALongReason() {
        MainActivityHost host = new MainActivityHost();
        View card = host.inflate();
        ((TextView) card.findViewById(R.id.cf_reason)).setText(longReason());

        float density = host.activity.getResources().getDisplayMetrics().density;
        int width = Math.round(density * 320) - Math.round(density * 24);
        int maxHeight = Math.round(density * (480 - 28 - 72 * 2));
        android.graphics.Rect box = layoutCard(card, width, maxHeight, Math.round(density * 8));

        assertTrue("卡片高过上限：" + box.height() + " > " + maxHeight, box.height() <= maxHeight);
        View scroll = card.findViewById(R.id.cf_scroll);
        assertTrue("文字区应该缩起来（不是 wrap_content）",
                scroll.getLayoutParams().height != android.view.ViewGroup.LayoutParams.WRAP_CONTENT);
        assertTrue("文字区不能被缩没", scroll.getHeight() > 0);
        assertButtonsInside(card, box);
    }

    /** 屏幕太窄或字体调大：按钮竖着排，谁都不会被挤出屏幕。 */
    @Test
    public void narrowScreenStacksTheButtons() {
        MainActivityHost host = new MainActivityHost();
        View card = host.inflate();
        float density = host.activity.getResources().getDisplayMetrics().density;
        int width = Math.round(density * 200);
        android.graphics.Rect box = layoutCard(card, width, Math.round(density * 800),
                Math.round(density * 8));

        android.widget.LinearLayout row = card.findViewById(R.id.cf_buttons);
        assertEquals("窄屏要竖排", android.widget.LinearLayout.VERTICAL, row.getOrientation());
        assertButtonsInside(card, box);
    }

    /** 正常屏幕还是一行排开，不要因为宽度够也竖着排。 */
    @Test
    public void normalScreenKeepsThemInOneRow() {
        MainActivityHost host = new MainActivityHost();
        View card = host.inflate();
        float density = host.activity.getResources().getDisplayMetrics().density;
        int width = Math.round(density * 411) - Math.round(density * 24);
        android.graphics.Rect box = layoutCard(card, width, Math.round(density * 700),
                Math.round(density * 8));

        android.widget.LinearLayout row = card.findViewById(R.id.cf_buttons);
        assertEquals(android.widget.LinearLayout.HORIZONTAL, row.getOrientation());
        assertButtonsInside(card, box);
    }

    /** 重复适配（同一张卡被量了两次）结果要一样，不能越量越窄。 */
    @Test
    public void fittingTwiceGivesTheSameResult() {
        MainActivityHost host = new MainActivityHost();
        View card = host.inflate();
        ((TextView) card.findViewById(R.id.cf_reason)).setText(longReason());
        float density = host.activity.getResources().getDisplayMetrics().density;
        int width = Math.round(density * 320) - Math.round(density * 24);
        int maxHeight = Math.round(density * (480 - 28 - 72 * 2));
        int gap = Math.round(density * 8);

        android.graphics.Rect first = layoutCard(card, width, maxHeight, gap);
        // 四个按钮在 320dp 上放不下一行，会竖排；第二次量出来得是同一套排法
        int firstOrientation =
                ((android.widget.LinearLayout) card.findViewById(R.id.cf_buttons)).getOrientation();
        android.graphics.Rect second = layoutCard(card, width, maxHeight, gap);
        assertEquals(first.height(), second.height());
        assertEquals(firstOrientation,
                ((android.widget.LinearLayout) card.findViewById(R.id.cf_buttons)).getOrientation());
    }
}
