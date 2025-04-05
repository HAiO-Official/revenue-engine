import express from 'express';
import cors from 'cors';
import { getStatus, getRecentLogs, initializeDatabase } from './db';
import { runAgentCycleOnce, transferUsdcFromAdminToOp, formatTokenAmount } from './agent';

const app = express();
const port = process.env.PORT || 3001; // API 서버 포트

const USDC_DECIMALS = 6;

app.use(cors()); // 모든 출처 허용 (개발용)
app.use(express.json());

// Agent 상태 조회 엔드포인트
app.get('/api/agent-status', async (req, res) => {
    try {
        const status = await getStatus();
        if (status) {
            res.json(status); 
        } else {
            res.status(500).json({ error: "Could not retrieve agent status." });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Agent 로그 조회 엔드포인트
app.get('/api/agent-logs', async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    try {
        const logs = await getRecentLogs(limit);
        res.json(logs);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/simulate-and-run', async (req, res) => {
    console.log("[API] Received /api/simulate-and-run request");
    try {
        // 1. 요청 바디에서 USDC 양 가져오기 (없으면 기본값 또는 에러)
        const amountLamports = BigInt(req.body?.amountLamports || process.env.DEFAULT_SIMULATE_USDC_LAMPORTS || (100 * (10**USDC_DECIMALS))); // 예: 기본 100 USDC
        if (amountLamports <= 0) {
            return res.status(400).json({ success: false, message: "Invalid amount specified." });
        }

        // 2. Admin -> Op Wallet으로 USDC 전송
        const transferTxId = await transferUsdcFromAdminToOp(amountLamports);
        console.log(`[API] USDC Transfer completed: ${transferTxId}`);

        // 3. Agent 사이클 1회 실행 호출 (비동기 실행, 완료 기다리지 않음)
        // runAgentCycleOnce 함수가 에러를 throw하면 여기서 catch됨
        runAgentCycleOnce().catch(error => {
            // 백그라운드 실행 에러 로깅 (API 응답은 이미 전송됨)
            console.error("[API] Error during background agent cycle:", error);
        });

        // 4. FE에 즉시 응답 (Agent 완료 여부와 관계없이)
        res.json({ success: true, message: `Revenue simulation started (${formatTokenAmount(amountLamports, USDC_DECIMALS)} USDC sent). Agent processing initiated.`, transferTxId });

    } catch (error: any) {
        console.error("[API] Error in /api/simulate-and-run:", error);
        res.status(500).json({ success: false, message: `Failed to simulate revenue: ${error.message}` });
    }
});


// (선택적) Agent 처리 수동 트리거 엔드포인트
// app.post('/api/trigger-process', async (req, res) => {
//     console.log("API: Manual process trigger requested.");
//     try {
//         // 주의: runAgentCycleOnce는 비동기이므로 완료를 기다리지 않음
//         runAgentCycleOnce(); // agent.ts에서 이 함수 export 필요
//         res.json({ message: "Agent process triggered." });
//     } catch (error: any) {
//         res.status(500).json({ error: `Trigger failed: ${error.message}` });
//     }
// });

// 서버 시작 함수
export async function startApiServer() {
    await initializeDatabase(); // 서버 시작 전 DB 초기화
    app.listen(port, () => {
        console.log(`Agent API server listening on port ${port}`);
    });
}

// 만약 이 파일을 직접 실행한다면 서버 시작
if (require.main === module) {
    startApiServer();
}
