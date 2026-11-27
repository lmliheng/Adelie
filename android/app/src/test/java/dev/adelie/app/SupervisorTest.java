package dev.adelie.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/**
 * 看门狗的退避规则（纯逻辑，不需要 Android）：
 * 第一次 1.5s、第二次 5s、第三次 15s，之后放弃；自己点的停止不拉起；撑过一分钟重新计数。
 */
public class SupervisorTest {

    @Test
    public void firstExitWaitsABitThenBacksOff() {
        Supervisor s = new Supervisor();
        assertEquals(1500L, s.onExit(1_000L, false));
        assertEquals(1, s.failures());
        assertEquals(5000L, s.onExit(2_000L, false));
        assertEquals(2, s.failures());
        assertEquals(15000L, s.onExit(3_000L, false));
        assertEquals(3, s.failures());
        assertEquals(Supervisor.GIVE_UP, s.onExit(4_000L, false));
        assertEquals(3, s.failures());
    }

    @Test
    public void userStopIsNeverRestarted() {
        Supervisor s = new Supervisor();
        s.onExit(1_000L, false);
        s.onExit(2_000L, false);

        assertEquals(Supervisor.USER_STOPPED, s.onExit(3_000L, true));
        assertEquals("自己停的要清零，下一次事故从头数", 0, s.failures());
        assertEquals(1500L, s.onExit(4_000L, false));
    }

    @Test
    public void aLongHealthyRunResetsTheCounter() {
        Supervisor s = new Supervisor();
        s.onExit(1_000L, false);
        s.onExit(2_000L, false);
        assertEquals(2, s.failures());

        // 这次跑了一分钟以上才退出：不该被前两次拖累
        s.started(10_000L);
        assertEquals(1500L, s.onExit(10_000L + Supervisor.HEALTHY_MS, false));
        assertEquals(1, s.failures());
    }

    @Test
    public void shortRunDoesNotReset() {
        Supervisor s = new Supervisor();
        s.onExit(1_000L, false);
        s.started(2_000L);
        assertEquals("只跑了 10 秒算连续失败", 5000L, s.onExit(12_000L, false));
        assertEquals(2, s.failures());
    }

    @Test
    public void resetClearsEverything() {
        Supervisor s = new Supervisor();
        s.onExit(1_000L, false);
        s.onExit(2_000L, false);
        s.reset();
        assertEquals(0, s.failures());
        assertEquals(1500L, s.onExit(3_000L, false));
    }
}
