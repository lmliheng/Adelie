package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.os.Looper;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 看门狗接到 Core 上的那半边：服务意外退出要按计划拉起，界面上的 phase 要跟着说话，
 * 用户自己停了就不能再被拉起来。
 *
 * <p>这里把「真的重启进程」换成计数器，所以不需要 node 也能验证时序。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class CoreRestartTest {

    private final AtomicInteger restarts = new AtomicInteger();

    @Before
    public void setUp() {
        Core.resetWatchdogForTest();
        Core.restartAction = new Runnable() {
            @Override
            public void run() {
                restarts.incrementAndGet();
            }
        };
    }

    @After
    public void tearDown() {
        Core.resetWatchdogForTest();
    }

    private void idle(long millis) {
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(millis));
    }

    @Test
    public void unexpectedExitIsRestartedAndSaysSo() {
        Core.onServiceExit(1);
        assertTrue("界面要说清楚在等什么：" + Core.phase, Core.phase.contains("自动重启"));
        assertTrue(Core.failed());
        assertEquals(0, restarts.get());

        idle(2000);
        assertEquals(1, restarts.get());
        assertTrue(Core.phase.contains("正在重启"));
    }

    @Test
    public void userStopCancelsAPendingRestart() {
        Core.onServiceExit(1);
        Core.stop();
        idle(5000);

        assertEquals("用户自己停了，就不该再拉起", 0, restarts.get());
        assertEquals("已停止", Core.phase);
        assertFalse(Core.failed());
    }

    @Test
    public void afterThreeTriesItGivesUpAndStopsRetrying() {
        for (int i = 0; i < 3; i++) {
            Core.onServiceExit(1);
            idle(16_000);
        }
        assertEquals(3, restarts.get());

        Core.onServiceExit(1);
        idle(20_000);
        assertEquals("第四次不再拉起", 3, restarts.get());
        assertTrue("放弃时要说清楚：" + Core.phase, Core.phase.contains("反复退出"));
        assertTrue(Core.failed());
    }

    @Test
    public void exitClearsStaleUrlAndClaimLink() {
        Core.baseUrl = "http://127.0.0.1:4000";
        Core.claimUrl = "http://127.0.0.1:4000/api/auth/claim?token=abc";
        Core.ready = true;

        Core.onServiceExit(1);
        assertFalse(Core.ready);
        assertEquals(null, Core.baseUrl);
        assertEquals("旧的首登链接已经用过，不能再留着", null, Core.claimUrl);
    }
}
