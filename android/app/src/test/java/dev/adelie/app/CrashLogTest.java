package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * 崩溃现场：手机上没有 logcat，用户只能说「它闪退了」。这里锁住「崩的时候确实留下来一份」
 * 和「留的东西够定位」—— 时间、版本、线程、异常、堆栈。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class CrashLogTest {

    private Context ctx;

    @Before
    public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        CrashLog.clear(ctx);
    }

    @Test
    public void nothingIsRecordedUntilSomethingCrashes() {
        assertFalse(CrashLog.has(ctx));
        assertEquals("", CrashLog.read(ctx));
        assertEquals(0L, CrashLog.time(ctx));
    }

    @Test
    public void theReportSaysWhatWentWrongAndWhere() {
        CrashLog.write(ctx, Thread.currentThread(),
                new IllegalStateException("测试用的一次崩溃"));

        assertTrue(CrashLog.has(ctx));
        String text = CrashLog.read(ctx);
        assertTrue(text, text.contains("时间："));
        assertTrue(text, text.contains("版本："));
        assertTrue(text, text.contains("线程："));
        assertTrue(text, text.contains("java.lang.IllegalStateException: 测试用的一次崩溃"));
        // 堆栈才是能定位问题的部分
        assertTrue(text, text.contains("CrashLogTest"));
        assertTrue("崩溃也得进运行日志", String.join("\n", Core.lines()).contains("未捕获异常"));
    }

    @Test
    public void aCrashWithoutAThrowableIsStillWritten() {
        CrashLog.write(ctx, null, null);
        String text = CrashLog.read(ctx);
        assertTrue(text, text.contains("异常："));
        assertTrue(text, text.contains("线程："));
    }

    @Test
    public void clearingForgetsTheCrash() {
        CrashLog.write(ctx, Thread.currentThread(), new RuntimeException("boom"));
        assertTrue(CrashLog.has(ctx));
        CrashLog.clear(ctx);
        assertFalse(CrashLog.has(ctx));
        assertEquals("", CrashLog.read(ctx));
    }

    /** 包一层：先记下来，再把异常交给原来的处理器 —— 系统的「已停止」照旧。 */
    @Test
    public void theWrapperRecordsAndPassesTheCrashOn() {
        final boolean[] passedOn = {false};
        Thread.UncaughtExceptionHandler chained = new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread t, Throwable e) {
                passedOn[0] = true;
            }
        };
        CrashLog.wrap(ctx, chained).uncaughtException(Thread.currentThread(),
                new RuntimeException("交给系统的那个"));

        assertTrue("得记下来", CrashLog.has(ctx));
        assertTrue(CrashLog.read(ctx).contains("交给系统的那个"));
        assertTrue("得接着交给原来的处理器", passedOn[0]);
    }

    @Test
    public void theWrapperSurvivesWithoutAChainedHandler() {
        CrashLog.wrap(ctx, null).uncaughtException(Thread.currentThread(),
                new RuntimeException("没有人接着也没事"));
        assertTrue(CrashLog.has(ctx));
    }

    /** 装兜底只装一次：重复装不会一层套一层。 */
    @Test
    public void installingIsIdempotent() {
        CrashLog.install(ctx);
        Thread.UncaughtExceptionHandler once = Thread.getDefaultUncaughtExceptionHandler();
        assertNotNull(once);
        CrashLog.install(ctx);
        assertEquals("装两次也只该有一层", once, Thread.getDefaultUncaughtExceptionHandler());
    }
}
