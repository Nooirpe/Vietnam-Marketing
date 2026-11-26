import { dataKey } from '../../data/indexes'
import type { MetricContext, Snapshot } from '../../types/snapshot'
import { surveyLabel } from '../common/useAnalysisContext'

export function SurveySummary({ snapshot, geoId, context }: { snapshot: Snapshot; geoId: string; context: MetricContext }) {
  const row = snapshot.evidenceByKey.get(dataKey(geoId, context.period, context.segment, context.study))
  return (
    <div className="space-y-1 text-sm text-slate-700">
      <p>Phân khúc {surveyLabel(context.segment) || '—'} · Kỳ {context.period}</p>
      <p>Bảng hỏi {surveyLabel(context.study) || '—'}</p>
      {context.study === 'grocery_delivery_v1' && (
        <p>Câu hỏi về nhu cầu giao hàng tạp hóa chưa được đáp ứng, kênh ưu tiên và mức phí sẵn lòng trả cho một lần giao.</p>
      )}
      {row?.evidenceState === 'available' ? (
        <>
          <p className="font-semibold">Kết quả trong mẫu khảo sát · n = {row.n}</p>
          <p>Phương pháp {row.method}</p>
        </>
      ) : (
        <p className="rounded bg-amber-50 px-2 py-1 font-medium text-amber-950">
          Chưa có khảo sát · {row?.reason ?? 'Không tìm thấy khảo sát khớp'}
        </p>
      )}
    </div>
  )
}
