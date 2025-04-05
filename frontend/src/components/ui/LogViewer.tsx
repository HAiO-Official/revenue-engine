import React, { useEffect, useRef } from 'react';
import '../../App.css';

interface LogViewerProps {
    logs: string[]; // HTML 문자열 배열
}

const LogViewer = ({ logs }: LogViewerProps) => {
    const logContainerRef = useRef<HTMLDivElement>(null);

    // 새 로그가 추가될 때 맨 위로 스크롤
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = 0;
        }
    }, [logs]);

    return (
        <div className="log-container" ref={logContainerRef}>
            {logs.length === 0 ? (
                <p>No logs yet...</p>
            ) : (
                logs.map((log, index) => (
                    // dangerouslySetInnerHTML은 로그 포맷팅 함수에서 생성된 HTML을 렌더링하기 위함
                    <div key={index} dangerouslySetInnerHTML={{ __html: log }}></div>
                ))
            )}
        </div>
    );
};

export default LogViewer;