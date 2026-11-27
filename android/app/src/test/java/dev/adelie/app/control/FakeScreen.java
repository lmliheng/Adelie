package dev.adelie.app.control;

import android.graphics.Rect;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;

/**
 * 假屏幕：按脚本一屏一屏换，用完就一直给最后一屏。
 *
 * <p>「等界面稳住」「滑着找」这类逻辑要反复读屏，真机要无障碍服务，这里把「每读一次看到什么」
 * 变成一串脚本；节点用 {@code AccessibilityNodeInfo.obtain()} 在 Robolectric 里就能造。
 */
final class FakeScreen implements PhoneControl.ScreenSource {

    private final LinkedList<List<AccessibilityNodeInfo>> frames = new LinkedList<>();
    private List<AccessibilityNodeInfo> last = new ArrayList<>();
    private String foreground = "";
    int calls;

    static AccessibilityNodeInfo node(String text, int top, boolean clickable) {
        AccessibilityNodeInfo n = AccessibilityNodeInfo.obtain();
        n.setText(text);
        n.setClassName("android.widget.TextView");
        n.setClickable(clickable);
        n.setBoundsInScreen(new Rect(0, top, 400, top + 80));
        return n;
    }

    static List<AccessibilityNodeInfo> row(AccessibilityNodeInfo... nodes) {
        List<AccessibilityNodeInfo> list = new ArrayList<>();
        for (AccessibilityNodeInfo n : nodes) list.add(n);
        return list;
    }

    FakeScreen frame(List<AccessibilityNodeInfo> frame) {
        frames.add(frame);
        last = frame;
        return this;
    }

    /** 这一屏读不到窗口。 */
    FakeScreen nothing() {
        frames.add(null);
        return this;
    }

    FakeScreen foreground(String pkg) {
        foreground = pkg;
        return this;
    }

    int remaining() {
        return frames.size();
    }

    @Override
    public List<AccessibilityNodeInfo> snapshot() {
        calls++;
        if (!frames.isEmpty()) last = frames.removeFirst();
        return last;
    }

    @Override
    public String foreground() {
        return foreground;
    }
}
