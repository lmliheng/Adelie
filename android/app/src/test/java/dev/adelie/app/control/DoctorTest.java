package dev.adelie.app.control;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.File;

/**
 * `doctor`：模型第一句该跑的自检。
 *
 * <p>真机上出过这样一幕——Agent 不知道有手机操控，去 shell 里试 `input` / `uiautomator`，
 * 全被权限挡回来，然后告诉用户「这台 App 没有无障碍能力」。自检要在**无障碍没开的时候**
 * 也能答：缺的是哪一样、用户该去点哪里、别走哪条错路。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class DoctorTest {

    private Context context;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        PhoneControl.attachContext(context);
    }

    @After
    public void tearDown() {
        ControlServer.stop();
        PhoneControl.attachContext(null);
    }

    @Test
    public void withoutAccessibilityItSaysWhatIsMissingAndWhatToDo() throws Exception {
        JSONObject out = PhoneControl.handle(new JSONObject().put("action", "doctor"));

        assertFalse(out.getBoolean("ok"));
        assertFalse(out.getBoolean("accessibility"));
        assertFalse(out.getBoolean("control"));
        assertTrue(out.getString("next").contains("无障碍"));
        assertTrue(out.getString("next").contains("Adelie 手机操控"));
        // 这条错路必须当场堵死，否则模型会跑一遍 shell 再得出错误结论
        assertTrue(out.getString("hint").contains("uiautomator"));
        assertTrue(out.getString("hint").contains("input"));
        assertTrue(out.getInt("sdk") >= 24);
    }

    @Test
    public void itIsAKnownActionEvenWhenNothingWorks() throws Exception {
        JSONObject out = PhoneControl.handle(new JSONObject().put("action", "doctor"));
        assertFalse("不该被当成不认识的 action", "bad_request".equals(out.optString("error")));
    }

    @Test
    public void itReportsHowManyAgentsGotTheSkill() throws Exception {
        File state = new File(context.getFilesDir(),
                "adelie/data/default_project/agents/default_agent/agent_state");
        assertTrue(state.mkdirs() || state.isDirectory());
        PhoneSkill.ensure(context);

        JSONObject out = PhoneControl.handle(new JSONObject().put("action", "doctor"));

        assertEquals(1, out.getInt("skill"));
        assertEquals(1, out.getJSONArray("agents").length());
        assertEquals("default_agent", out.getJSONArray("agents").getString(0));
        assertTrue(out.has("version"));
    }

    @Test
    public void zeroAgentsIsReportedAsZero() throws Exception {
        JSONObject out = PhoneControl.handle(new JSONObject().put("action", "doctor"));
        assertEquals(0, out.getInt("skill"));
        assertFalse(out.has("agents"));
    }

    @Test
    public void helpMentionsTheDoctor() throws Exception {
        JSONObject out = PhoneControl.handle(new JSONObject().put("action", "help"));
        assertTrue(out.getString("help").contains("doctor"));
    }
}
