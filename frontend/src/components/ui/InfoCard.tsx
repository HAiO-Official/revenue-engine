import React from 'react';
import '../../App.css'; // 전역 CSS 사용

interface InfoCardProps {
    title: string;
    description: string;
    value: string | number;
    unit?: string;
    elementId?: string;
}

const InfoCard = ({ title, description, value, unit, elementId }: InfoCardProps) => (
    <div className="card" id={elementId}>
        <h3>{title}</h3>
        <p className="description">{description}</p>
        <p>
            <span className="value">{value}</span>
            {unit && <span className="unit">{unit}</span>}
        </p>
    </div>
);

export default InfoCard;