package dev.adelie.app.control;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * 应用名单与任务日志：名单是「只让你勾的应用被操作」，空名单表示不限制；
 * 日志在没开无障碍时也能读（它只记录协议层发生过什么）。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class AllowlistTest {

    @After
    public void tearDown() {
        PhoneControl.setAllowedPackages(null);
    }

    @Test
    public void emptyListAllowsEverything() {
        PhoneControl.setAllowedPackages(new String[0]);
        assertTrue(PhoneControl.allowedToControl("com.tencent.mm"));
        assertTrue(PhoneControl.allowedToControl("com.android.settings"));
    }

    @Test
    public void onlyListedPackagesPass() {
        PhoneControl.setAllowedPackages(new String[]{"com.tencent.mm", "com.android.settings"});
        assertTrue(PhoneControl.allowedToControl("com.tencent.mm"));
        assertFalse(PhoneControl.allowedToControl("com.taobao.taobao"));
        assertEquals(2, PhoneControl.allowedPackages().length);
    }

    @Test
    public void unknownForegroundIsNotBlockedByAnEmptyPackage() {
        PhoneControl.setAllowedPackages(new String[]{"com.tencent.mm"});
        // 还没收到窗口事件时前台是空字符串，不能因此把所有动作都拒掉
        assertTrue(PhoneControl.allowedToControl(""));
        assertTrue(PhoneControl.allowedToControl(null));
    }

    @Test
    public void journalIsReadableBeforeAnyTask() throws Exception {
        JSONObject out = PhoneControl.handle(new JSONObject().put("action", "journal"));
        assertTrue(out.getBoolean("ok"));
        assertTrue(out.getInt("count") >= 0);
        assertTrue(out.has("entries"));
    }
}
