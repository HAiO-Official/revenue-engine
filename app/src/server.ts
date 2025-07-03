import express from 'express';
import cors from 'cors';
import { getStatus, getRecentLogs, initializeDatabase } from './db';
import { runAgentCycleOnce, transferUsdcFromExternalToOp, formatTokenAmount } from './agent';

const app = express();
const port = process.env.PORT || 3001; // API server port

const USDC_DECIMALS = 6;

app.use(cors()); // Allow all origins (for development)
app.use(express.json());

// Agent status query endpoint
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

// Agent log query endpoint
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
        // 1. Get USDC amount from request body (use default value or error if missing)
        const amountLamports = BigInt(req.body?.amountLamports || process.env.DEFAULT_SIMULATE_USDC_LAMPORTS || (100 * (10**USDC_DECIMALS))); // e.g. default 100 USDC
        if (amountLamports <= 0) {
            return res.status(400).json({ success: false, message: "Invalid amount specified." });
        }

        // 2. Transfer USDC from External to Op Wallet
        const transferTxId = await transferUsdcFromExternalToOp(amountLamports);
        console.log(`[API] USDC Transfer completed: ${transferTxId}`);

        // 3. Call agent cycle once (async execution, don't wait for completion)
        // If runAgentCycleOnce function throws error, it will be caught here
        runAgentCycleOnce().catch(error => {
            // Background execution error logging (API response already sent)
            console.error("[API] Error during background agent cycle:", error);
        });

        // 4. Immediate response to FE (regardless of Agent completion status)
        res.json({ success: true, message: `Revenue simulation started (${formatTokenAmount(amountLamports, USDC_DECIMALS)} USDC sent). Agent processing initiated.`, transferTxId });

    } catch (error: any) {
        console.error("[API] Error in /api/simulate-and-run:", error);
        res.status(500).json({ success: false, message: `Failed to simulate revenue: ${error.message}` });
    }
});


// (Optional) Agent processing manual trigger endpoint
// app.post('/api/trigger-process', async (req, res) => {
//     console.log("API: Manual process trigger requested.");
//     try {
//         // Note: runAgentCycleOnce is async so don't wait for completion
//         runAgentCycleOnce(); // Need to export this function from agent.ts
//         res.json({ message: "Agent process triggered." });
//     } catch (error: any) {
//         res.status(500).json({ error: `Trigger failed: ${error.message}` });
//     }
// });

// Server start function
export async function startApiServer() {
    await initializeDatabase(); // DB initialization before server start
    app.listen(port, () => {
        console.log(`Agent API server listening on port ${port}`);
    });
}

// Start server if this file is executed directly
if (require.main === module) {
    startApiServer();
}
