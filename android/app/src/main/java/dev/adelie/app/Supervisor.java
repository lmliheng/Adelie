package dev.adelie.app;

/**
 * 服务进程意外退出后要不要自动拉起、等多久。
 *
 * <p>纯逻辑，不碰 Handler 也不碰进程：只看「上一次撑了多久」「已经连续失败几次」，
 * 给一个等待时间。自动拉起只给三次机会（1.5s / 5s / 15s），还起不来就交回界面上的
 * 「重试」，免得一份必崩的数据把电池耗光。用户自己点的停止不算事故，也不会被拉起。
 *
 * <p>手机上的 node 是前台服务里跑的普通进程，被系统回收、被别的清理器杀掉都可能发生；
 * 没有这一层的话，界面只会停在「服务已退出」，人得手动点重试才能继续聊。
 */
final class Supervisor {

    /** 连续失败时的等待时间。 */
    static final long[] DELAYS = {1500L, 5000L, 15000L};
    /** 撑过这么久就算「健康」，连续失败次数清零。 */
    static final long HEALTHY_MS = 60_000L;

    /** 不再重启（连续失败太多次）。 */
    static final long GIVE_UP = -1L;
    /** 用户自己停的，不该重启。 */
    static final long USER_STOPPED = -2L;

    private int failures;
    private long startedAt;

    /** 服务真的跑起来了（认出了监听端口）时调用。 */
    void started(long now) {
        startedAt = now;
    }

    /**
     * 进程退出后调用。
     *
     * @return 还要等多少毫秒再拉起，或者 {@link #GIVE_UP} / {@link #USER_STOPPED}
     */
    long onExit(long now, boolean userStopped) {
        if (userStopped) {
            failures = 0;
            startedAt = 0;
            return USER_STOPPED;
        }
        if (startedAt > 0 && now - startedAt >= HEALTHY_MS) {
            // 上一次撑够久了，当它是新的一轮：别让历史上的崩溃把它永久判死
            failures = 0;
        }
        startedAt = 0;
        if (failures >= DELAYS.length) return GIVE_UP;
        long delay = DELAYS[failures];
        failures++;
        return delay;
    }

    /** 已经连续拉起过几次。 */
    int failures() {
        return failures;
    }

    void reset() {
        failures = 0;
        startedAt = 0;
    }
}
