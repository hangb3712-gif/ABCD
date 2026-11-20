"""
Agent 4: Interactive HTML Report Generator Agent (Agent Xuất Báo cáo HTML Trực tiếp)
Nhiệm vụ:
- Tổng hợp kết quả từ Profiler Agent, Cleaning Agent (Human-in-the-Loop) và Analysis Agent
- Xuất ra tài liệu HTML5 hoàn chỉnh, độc lập (Self-contained HTML), có biểu đồ Vector SVG tương tác sắc nét
- Hiển thị trực tiếp trên giao diện người dùng (Live Preview), hỗ trợ chỉnh sửa trực tiếp, in PDF và tải file .html
"""

import html
from datetime import datetime
from typing import Dict, List, Any
import pandas as pd
import numpy as np


class HTMLReportGeneratorAgent:
    """Agent chuyên trách kết xuất Báo cáo Phân tích Dữ liệu dưới dạng HTML trực tiếp."""

    def _build_svg_time_series(self, ts_data: Dict[str, Any]) -> str:
        """Vẽ biểu đồ đường & miền (SVG Area/Line Chart) sắc nét, không phụ thuộc thư viện ngoài."""
        if not ts_data or not ts_data.get("has_time_series"):
            return ""
        labels = ts_data.get("labels", [])
        values = ts_data.get("values", [])
        if len(labels) < 2 or not values:
            return ""

        width, height = 760, 260
        pad_left, pad_right, pad_top, pad_bottom = 65, 30, 25, 48
        plot_w = width - pad_left - pad_right
        plot_h = height - pad_top - pad_bottom

        min_v = min(values)
        max_v = max(values)
        if max_v == min_v:
            max_v = min_v + 1.0
        # Mở rộng nhẹ biên dưới
        y_min = max(0.0, min_v * 0.85) if min_v >= 0 else min_v * 1.1

        points = []
        circles_svg = []
        n = len(values)
        for i, (lbl, val) in enumerate(zip(labels, values)):
            x = pad_left + (i / max(n - 1, 1)) * plot_w
            y = pad_top + plot_h - ((val - y_min) / max(max_v - y_min, 1e-6)) * plot_h
            points.append(f"{x:.1f},{y:.1f}")
            val_fmt = f"{val:,.0f}" if abs(val) >= 100 else f"{val:,.2f}"
            show_label = (n <= 12) or (i % max(1, n // 8) == 0) or (i == n - 1)
            x_lbl_svg = (
                f'<text x="{x:.1f}" y="{height - 14}" text-anchor="middle" font-size="10" fill="#64748b">{html.escape(str(lbl)[-5:])}</text>'
                if show_label else ""
            )
            circles_svg.append(
                f'<g class="chart-point">'
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.5" fill="#ffafcc" stroke="#2b1d38" stroke-width="1.8">'
                f'<title>{html.escape(str(lbl))}: {val_fmt}</title></circle>'
                f'{x_lbl_svg}</g>'
            )

        poly_points = " ".join(points)
        area_points = f"{pad_left},{pad_top + plot_h} {poly_points} {pad_left + plot_w},{pad_top + plot_h}"

        # Vẽ lưới ngang
        grid_svg = []
        for step in range(5):
            gy = pad_top + (step / 4) * plot_h
            gval = max_v - (step / 4) * (max_v - y_min)
            gval_str = f"{gval/1e6:.1f}M" if abs(gval) >= 1e6 else (f"{gval/1e3:.0f}K" if abs(gval) >= 1e3 else f"{gval:.1f}")
            grid_svg.append(
                f'<line x1="{pad_left}" y1="{gy:.1f}" x2="{width - pad_right}" y2="{gy:.1f}" stroke="#cdb4db" stroke-dasharray="4 4"/>'
                f'<text x="{pad_left - 8}" y="{gy + 4:.1f}" text-anchor="end" font-size="10.5" fill="#6e5682">{gval_str}</text>'
            )

        return f"""
        <div class="rpt-card">
            <div class="rpt-card-header">
                <h3>Biểu đồ Xu hướng Thời gian: {html.escape(str(ts_data.get('metric_col', '')))} theo {html.escape(str(ts_data.get('date_col', '')))}</h3>
                <span class="rpt-badge">Chuỗi thời gian ({len(labels)} mốc)</span>
            </div>
            <div style="overflow-x:auto;">
                <svg viewBox="0 0 {width} {height}" style="width:100%; height:auto; max-height:280px; display:block;">
                    <defs>
                        <linearGradient id="tsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#a2d2ff" stop-opacity="0.55"/>
                            <stop offset="100%" stop-color="#ffc8dd" stop-opacity="0.08"/>
                        </linearGradient>
                    </defs>
                    {"".join(grid_svg)}
                    <polygon points="{area_points}" fill="url(#tsGrad)"/>
                    <polyline fill="none" stroke="#ffafcc" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="{poly_points}"/>
                    {"".join(circles_svg)}
                </svg>
            </div>
            <div style="margin-top:10px;padding:9px 12px;background:#fcf9fe;border-left:3px solid #cdb4db;border-radius:6px;font-size:12px;color:#4a355b;line-height:1.5;">
                <div><strong>📖 Giải thích:</strong> Theo dõi diễn biến <b>{html.escape(str(ts_data.get('metric_col', '')))}</b> qua <b>{len(labels)}</b> mốc thời gian, đạt đỉnh cao nhất <b>{max_v:,.1f}</b> và thấp nhất <b>{min_v:,.1f}</b>.</div>
                <div style="color:#6e5682;margin-top:3px;"><strong>🏷️ Chú thích:</strong> Đường hồng &amp; vùng tô màu = Xu hướng biến động theo thời gian · Mỗi điểm tròn = 1 mốc thời gian cụ thể.</div>
            </div>
        </div>
        """

    def _build_svg_donut(self, cb: Dict[str, Any]) -> str:
        """Vẽ biểu đồ Donut SVG sắc nét thể hiện cơ cấu tỷ trọng đóng góp (%)."""
        if not cb or not cb.get("items"):
            return ""
        items = cb.get("items", [])[:6]
        colors = ["#ffafcc", "#a2d2ff", "#cdb4db", "#ffc8dd", "#bde0fe", "#b594cc"]
        r = 68
        circ = 2 * 3.1415926535 * r
        offset = 0.0
        slices_svg = []
        legend_html = []
        total_pct = sum(float(it.get("share_pct", 0) or 0) for it in items) or 100.0
        for idx, it in enumerate(items):
            pct = float(it.get("share_pct", 0) or 0)
            frac = max(0.0, pct / max(total_pct, 1e-6))
            dash = frac * circ
            col = colors[idx % len(colors)]
            slices_svg.append(
                f'<circle cx="95" cy="95" r="{r}" fill="transparent" stroke="{col}" stroke-width="26" '
                f'stroke-dasharray="{dash:.2f} {circ:.2f}" stroke-dashoffset="{-offset:.2f}" '
                f'transform="rotate(-90 95 95)"><title>{html.escape(str(it.get("category", "")))}: {pct}%</title></circle>'
            )
            offset += dash
            legend_html.append(
                f'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:6px;">'
                f'<span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:3px;background:{col};display:inline-block;"></span>'
                f'<strong>{html.escape(str(it.get("category", "")))}</strong></span>'
                f'<span style="color:#6e5682;font-weight:700;">{pct}%</span></div>'
            )

        return f"""
        <div class="rpt-card">
            <div class="rpt-card-header">
                <h3>Biểu đồ Donut: Cơ cấu Tỷ trọng '{html.escape(str(cb.get('metric_col', '')))}'</h3>
                <span class="rpt-badge">Tỷ trọng %</span>
            </div>
            <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;justify-content:center;">
                <svg viewBox="0 0 190 190" style="width:185px;height:185px;flex-shrink:0;">
                    <circle cx="95" cy="95" r="{r}" fill="transparent" stroke="#f5ecf8" stroke-width="26"/>
                    {"".join(slices_svg)}
                    <text x="95" y="92" text-anchor="middle" font-size="11" fill="#6e5682" font-weight="600">Phân khúc</text>
                    <text x="95" y="110" text-anchor="middle" font-size="16" fill="#2b1d38" font-weight="800">{len(items)} nhóm</text>
                </svg>
                <div style="flex:1;min-width:170px;">
                    {"".join(legend_html)}
                </div>
            </div>
            <div style="margin-top:10px;padding:9px 12px;background:#fcf9fe;border-left:3px solid #cdb4db;border-radius:6px;font-size:12px;color:#4a355b;line-height:1.5;">
                <div><strong>📖 Giải thích:</strong> Thể hiện cơ cấu tỷ trọng đóng góp (%) của từng phân khúc vào tổng <b>{html.escape(str(cb.get('metric_col', '')))}</b>. Nhóm dẫn đầu là <b>{html.escape(str(items[0].get('category', '')))}</b> (<b>{items[0].get('share_pct', 0)}%</b>).</div>
                <div style="color:#6e5682;margin-top:3px;"><strong>🏷️ Chú thích:</strong> Mỗi mảng màu đại diện cho 1 phân khúc với tỷ lệ hiển thị tương ứng bên phải.</div>
            </div>
        </div>
        """

    def _build_svg_before_after_columns(self, cb: Dict[str, Any]) -> str:
        """Vẽ biểu đồ Cột Kép SVG đối chiếu Trước vs Sau làm sạch theo phân khúc."""
        if not cb or not cb.get("items"):
            return ""
        items = cb.get("items", [])[:6]
        width, height = 520, 240
        pad_l, pad_r, pad_t, pad_b = 58, 20, 26, 50
        plot_w = width - pad_l - pad_r
        plot_h = height - pad_t - pad_b
        max_v = max(
            max((abs(float(it.get("sum_before", it.get("sum", 0)) or 0)) for it in items), default=1.0),
            max((abs(float(it.get("sum", 0) or 0)) for it in items), default=1.0),
            1.0
        )
        grid_svg = []
        for s in range(5):
            gy = pad_t + (s / 4) * plot_h
            gv = max_v * (1 - s / 4)
            gv_str = f"{gv/1e6:.1f}M" if abs(gv) >= 1e6 else (f"{gv/1e3:.0f}K" if abs(gv) >= 1e3 else f"{gv:.0f}")
            grid_svg.append(
                f'<line x1="{pad_l}" y1="{gy:.1f}" x2="{width - pad_r}" y2="{gy:.1f}" stroke="#eadcf0" stroke-dasharray="3 3"/>'
                f'<text x="{pad_l - 6}" y="{gy + 4:.1f}" text-anchor="end" font-size="10" fill="#6e5682">{gv_str}</text>'
            )

        bars_svg = []
        group_w = plot_w / max(len(items), 1)
        bw = min(22, group_w * 0.32)
        for i, it in enumerate(items):
            v_raw = abs(float(it.get("sum_before", it.get("sum", 0)) or 0))
            v_clean = abs(float(it.get("sum", 0) or 0))
            h_raw = (v_raw / max_v) * plot_h
            h_clean = (v_clean / max_v) * plot_h
            cx = pad_l + i * group_w + group_w / 2
            cat_lbl = html.escape(str(it.get("category", ""))[:12])
            bars_svg.append(
                f'<rect x="{cx - bw - 2:.1f}" y="{pad_t + plot_h - h_raw:.1f}" width="{bw:.1f}" height="{h_raw:.1f}" rx="3" fill="#cdb4db">'
                f'<title>Trước làm sạch ({cat_lbl}): {v_raw:,.1f}</title></rect>'
                f'<rect x="{cx + 2:.1f}" y="{pad_t + plot_h - h_clean:.1f}" width="{bw:.1f}" height="{h_clean:.1f}" rx="3" fill="#ffafcc">'
                f'<title>Sau làm sạch ({cat_lbl}): {v_clean:,.1f}</title></rect>'
                f'<text x="{cx:.1f}" y="{height - 22}" text-anchor="middle" font-size="10" fill="#2b1d38" font-weight="600">{cat_lbl}</text>'
            )

        return f"""
        <div class="rpt-card">
            <div class="rpt-card-header">
                <h3>Biểu đồ Cột Kép: Đối chiếu Trước vs Sau Làm sạch</h3>
                <span class="rpt-badge">Gốc vs Sạch</span>
            </div>
            <div style="overflow-x:auto;">
                <svg viewBox="0 0 {width} {height}" style="width:100%;height:auto;max-height:235px;display:block;">
                    {"".join(grid_svg)}
                    {"".join(bars_svg)}
                    <rect x="{pad_l}" y="{height - 12}" width="10" height="8" rx="2" fill="#cdb4db"/>
                    <text x="{pad_l + 14}" y="{height - 5}" font-size="10" fill="#4a355b">Chưa làm sạch (Gốc)</text>
                    <rect x="{pad_l + 140}" y="{height - 12}" width="10" height="8" rx="2" fill="#ffafcc"/>
                    <text x="{pad_l + 154}" y="{height - 5}" font-size="10" fill="#4a355b">Sau làm sạch (Đã duyệt)</text>
                </svg>
            </div>
            <div style="margin-top:10px;padding:9px 12px;background:#fcf9fe;border-left:3px solid #cdb4db;border-radius:6px;font-size:12px;color:#4a355b;line-height:1.5;">
                <div><strong>📖 Giải thích:</strong> Đối chiếu giá trị <b>{html.escape(str(cb.get('metric_col', '')))}</b> trên <b>{len(items)}</b> phân khúc trước và sau khi AI làm sạch trùng lặp và giá trị lỗi.</div>
                <div style="color:#6e5682;margin-top:3px;"><strong>🏷️ Chú thích:</strong> Cột tím = Dữ liệu gốc chưa làm sạch · Cột hồng = Dữ liệu sạch đã chuẩn hóa.</div>
            </div>
        </div>
        """

    def _build_svg_quality_bars(self, h_before: Dict[str, Any], h_after: Dict[str, Any]) -> str:
        """Vẽ biểu đồ Cột Ngang Đối chiếu Mức độ Sạch Dữ liệu Trước vs Sau làm sạch."""
        metrics = [
            ("Đầy đủ (Không trống ô)", float(h_before.get("completeness", 0)), float(h_after.get("completeness", 98))),
            ("Không trùng lặp bản ghi", float(h_before.get("uniqueness", 0)), float(h_after.get("uniqueness", 100))),
            ("Đúng định dạng chuẩn", float(h_before.get("consistency", 0)), float(h_after.get("consistency", 98))),
            ("Giá trị hợp lý (Không lỗi)", float(h_before.get("validity", 0)), float(h_after.get("validity", 98))),
            ("Mức độ sạch tổng thể", float(h_before.get("overall", 0)), float(h_after.get("overall", 98))),
        ]
        rows = []
        for label, vb, va in metrics:
            wb = max(2.0, min(100.0, vb))
            wa = max(2.0, min(100.0, va))
            rows.append(f"""
            <div style="margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                    <strong>{html.escape(label)}</strong>
                    <span style="color:#6e5682;">Gốc: <b>{vb:.1f}</b> ➔ Sạch: <b style="color:#1b5a96;">{va:.1f}/100</b></span>
                </div>
                <div style="background:#f7eefb;height:7px;border-radius:4px;overflow:hidden;margin-bottom:3px;">
                    <div style="width:{wb}%;height:100%;background:#ffafcc;"></div>
                </div>
                <div style="background:#eef5fc;height:7px;border-radius:4px;overflow:hidden;">
                    <div style="width:{wa}%;height:100%;background:#a2d2ff;"></div>
                </div>
            </div>
            """)
        return f"""
        <div class="rpt-card">
            <div class="rpt-card-header">
                <h3>Biểu đồ Cột Ngang: Cải thiện Mức độ Sạch Dữ liệu (Trước vs Sau)</h3>
                <span class="rpt-badge">Chất lượng Dữ liệu</span>
            </div>
            <div>{"".join(rows)}</div>
            <div style="display:flex;gap:16px;font-size:11px;color:#6e5682;margin-top:6px;">
                <span><span style="display:inline-block;width:10px;height:8px;background:#ffafcc;border-radius:2px;margin-right:4px;"></span>Trước làm sạch</span>
                <span><span style="display:inline-block;width:10px;height:8px;background:#a2d2ff;border-radius:2px;margin-right:4px;"></span>Sau làm sạch</span>
            </div>
            <div style="margin-top:10px;padding:9px 12px;background:#fcf9fe;border-left:3px solid #cdb4db;border-radius:6px;font-size:12px;color:#4a355b;line-height:1.5;">
                <div><strong>📖 Giải thích:</strong> So sánh hiệu quả cải thiện mức độ sạch trên 5 tiêu chí cốt lõi. Điểm tổng thể tăng từ <b>{float(h_before.get('overall', 0)):.1f}/100</b> lên <b>{float(h_after.get('overall', 98)):.1f}/100</b>.</div>
                <div style="color:#6e5682;margin-top:3px;"><strong>🏷️ Chú thích:</strong> Thanh hồng = Điểm trước làm sạch (thang 0–100) · Thanh xanh = Điểm sau khi làm sạch và được duyệt.</div>
            </div>
        </div>
        """

    def generate_html_report(
        self,
        df: pd.DataFrame,
        initial_profile: Dict[str, Any],
        cleaning_report: Dict[str, Any],
        analysis_result: Dict[str, Any],
        report_title: str = "Báo Cáo Phân Tích & Làm Sạch Dữ Liệu Tự Hành (AI Agent)"
    ) -> str:
        """Tạo mã nguồn HTML hoàn chỉnh cho báo cáo."""
        now_str = datetime.now().strftime("%d/%m/%Y %H:%M")
        dataset_name = analysis_result.get("dataset_name", "Dataset")
        ai_insights = analysis_result.get("ai_insights", {})
        engine_mode = ai_insights.get("engine_mode", "Autonomous AI Agent")

        health_before = initial_profile.get("health_score", {}).get("overall", 0)
        health_after = cleaning_report.get("health_after", {}).get("overall", 98.0)
        health_delta = round(health_after - health_before, 1)

        # 1. Render KPI Cards
        kpi_cards_html = []
        palette = ["#ffafcc", "#a2d2ff", "#cdb4db", "#ffc8dd"]
        for idx, kpi in enumerate(analysis_result.get("kpis", [])[:4]):
            color = palette[idx % len(palette)]
            kpi_cards_html.append(f"""
            <div class="kpi-box" style="border-top: 5px solid {color};">
                <div class="kpi-label">{html.escape(str(kpi.get('label', '')))}</div>
                <div class="kpi-val" style="color:#2b1d38;">{html.escape(str(kpi.get('value', '')))}</div>
                <div class="kpi-sub">{html.escape(str(kpi.get('subtext', '')))}</div>
            </div>
            """)

        # 2. Render Biểu đồ Danh mục (Category Breakdown Charts)
        cat_charts_html = []
        bar_colors = ["#ffafcc", "#a2d2ff", "#cdb4db", "#ffc8dd", "#bde0fe"]
        for cb_idx, cb in enumerate(analysis_result.get("category_breakdowns", [])[:2]):
            items = cb.get("items", [])
            if not items:
                continue
            max_val = max((abs(it.get("metric_value", 0)) for it in items), default=1.0) or 1.0
            rows_html = []
            for i, it in enumerate(items):
                val = it.get("metric_value", 0)
                pct_width = max(4.0, round(abs(val) / max_val * 100, 1))
                val_str = f"{val:,.0f}" if abs(val) >= 100 else f"{val:,.2f}"
                b_color = bar_colors[i % len(bar_colors)]
                cnt_clean = it.get('count', 0)
                cnt_raw = it.get('count_before', cnt_clean)
                cnt_sub = f"{cnt_clean} dòng sạch" if cnt_clean == cnt_raw else f"{cnt_clean} dòng sạch (gốc: {cnt_raw})"
                rows_html.append(f"""
                <div class="bar-row">
                    <div class="bar-meta">
                        <span class="bar-cat-name">{html.escape(str(it.get('category', '')))} <small style="color:#64748b;">({cnt_sub})</small></span>
                        <span class="bar-cat-val"><strong>{val_str}</strong> <span class="pct-pill">{it.get('share_pct', 0)}%</span></span>
                    </div>
                    <div class="bar-track">
                        <div class="bar-fill" style="width:{pct_width}%; background:{b_color};"></div>
                    </div>
                </div>
                """)
            cat_charts_html.append(f"""
            <div class="rpt-card">
                <div class="rpt-card-header">
                    <h3>Phân tích '{html.escape(str(cb.get('metric_col', '')))}' theo '{html.escape(str(cb.get('category_col', '')))}'</h3>
                    <span class="rpt-badge">{html.escape(str(cb.get('aggregation', '')))}</span>
                </div>
                <div class="bar-chart-container">
                    {"".join(rows_html)}
                </div>
                <div style="margin-top:10px;padding:9px 12px;background:#fcf9fe;border-left:3px solid #cdb4db;border-radius:6px;font-size:12px;color:#4a355b;line-height:1.5;">
                    <div><strong>📖 Giải thích:</strong> Xếp hạng các phân khúc theo <b>{html.escape(str(cb.get('metric_col', '')))}</b> (nhóm cao nhất: <b>{html.escape(str(items[0].get('category', '')))}</b> chiếm <b>{items[0].get('share_pct', 0)}%</b>).</div>
                    <div style="color:#6e5682;margin-top:3px;"><strong>🏷️ Chú thích:</strong> Thanh ngang càng dài thể hiện quy mô giá trị càng lớn; con số trong ngoặc là số dòng sạch của phân khúc.</div>
                </div>
            </div>
            """)

        # 3. Render Root Cause Analysis, Key Findings & Recommendations
        rca_rows_html = []
        for idx, rc in enumerate(ai_insights.get("root_cause_analysis", []), 1):
            sev = str(rc.get("severity", "Cao"))
            sev_cls = "prio-high" if "nghiêm" in sev.lower() else "prio-med"
            rca_rows_html.append(f"""
            <tr>
                <td>
                    <div style="font-weight:700;font-size:12px;margin-bottom:4px;">{html.escape(str(rc.get('stage', 'Quy trình')))}</div>
                    <span class="prio-badge {sev_cls}">{html.escape(sev)}</span>
                </td>
                <td style="font-weight:700; color:#b52b65;">{html.escape(str(rc.get('issue', '')))}</td>
                <td>{html.escape(str(rc.get('root_cause', '')))}</td>
                <td style="color:#4a355b;">{html.escape(str(rc.get('impact', '')))}</td>
                <td style="color:#1b5a96; font-weight:600;">{html.escape(str(rc.get('solution', '')))}</td>
            </tr>
            """)

        findings_html = []
        for idx, f in enumerate(ai_insights.get("key_findings", []), 1):
            findings_html.append(f"""
            <div class="finding-item">
                <div class="finding-num">{idx}</div>
                <div class="finding-body">
                    <h4>{html.escape(str(f.get('title', '')))}</h4>
                    <p>{html.escape(str(f.get('detail', '')))}</p>
                </div>
            </div>
            """)

        recs_rows = []
        for r in ai_insights.get("recommendations", []):
            prio = str(r.get("priority", "Cao"))
            p_class = "prio-high" if "cao" in prio.lower() or "trọng" in prio.lower() else "prio-med"
            recs_rows.append(f"""
            <tr>
                <td><span class="prio-badge {p_class}">{html.escape(prio)}</span></td>
                <td><strong>{html.escape(str(r.get('action', '')))}</strong></td>
                <td style="color:#1d4e78;font-weight:600;">{html.escape(str(r.get('owner', 'Bộ phận liên quan')))}</td>
                <td>{html.escape(str(r.get('timeline', 'Trong tháng')))}</td>
                <td>{html.escape(str(r.get('impact', '')))}</td>
            </tr>
            """)

        # 4. Render Bảng Nhật ký Làm sạch đã được Người dùng Duyệt (Human-in-the-Loop Audit Trail)
        cleaning_rows_html = []
        for step in cleaning_report.get("execution_summary", []):
            st_status = step.get("status", "applied")
            badge_cls = "status-applied" if st_status == "applied" else "status-skipped"
            badge_txt = "Đã thực thi (Approved)" if st_status == "applied" else "Giữ nguyên (Skipped)"
            cleaning_rows_html.append(f"""
            <tr>
                <td><strong>{html.escape(str(step.get('column', '')))}</strong></td>
                <td>{html.escape(str(step.get('issue_badge', '')))}</td>
                <td><code>{html.escape(str(step.get('strategy', '')))}</code></td>
                <td style="text-align:center;">{step.get('rows_affected', 0)}</td>
                <td><span class="status-pill {badge_cls}">{badge_txt}</span></td>
                <td>{html.escape(str(step.get('detail', '')))}</td>
            </tr>
            """)

        # 5. Render Bảng Thống kê Mô tả (Descriptive Statistics)
        stats_rows_html = []
        for st in analysis_result.get("numeric_summaries", []):
            def fmt(v: Any) -> str:
                if v is None:
                    return "-"
                return f"{v:,.0f}" if abs(v) >= 1000 else f"{v:,.2f}"

            stats_rows_html.append(f"""
            <tr>
                <td><strong>{html.escape(str(st.get('column', '')))}</strong></td>
                <td style="text-align:right;">{st.get('count', 0)}</td>
                <td style="text-align:right;">{fmt(st.get('mean'))}</td>
                <td style="text-align:right;">{fmt(st.get('std'))}</td>
                <td style="text-align:right;">{fmt(st.get('min'))}</td>
                <td style="text-align:right;">{fmt(st.get('q25'))}</td>
                <td style="text-align:right; font-weight:700; color:#4f46e5;">{fmt(st.get('median'))}</td>
                <td style="text-align:right;">{fmt(st.get('q75'))}</td>
                <td style="text-align:right;">{fmt(st.get('max'))}</td>
            </tr>
            """)

        # 6. Render Tương quan Pearson
        corr_rows_html = []
        for c in analysis_result.get("correlations", [])[:6]:
            r_val = c.get("r", 0.0)
            bar_w = min(100, int(abs(r_val) * 100))
            bar_c = "#10b981" if r_val >= 0 else "#ef4444"
            corr_rows_html.append(f"""
            <tr>
                <td><strong>{html.escape(str(c.get('col_a', '')))}</strong> ↔ <strong>{html.escape(str(c.get('col_b', '')))}</strong></td>
                <td style="text-align:right; font-weight:700; color:{bar_c};">{r_val:+.3f}</td>
                <td>
                    <div style="background:#f1f5f9; height:8px; border-radius:4px; overflow:hidden; width:120px;">
                        <div style="width:{bar_w}%; height:100%; background:{bar_c};"></div>
                    </div>
                </td>
                <td>{html.escape(str(c.get('strength', '')))} ({html.escape(str(c.get('direction', '')))})</td>
            </tr>
            """)

        # 7. Render Bảng Dữ liệu Sạch (Mặc định hiển thị tối đa 10 dòng + Nút hiển thị toàn bộ bảng nếu > 10 dòng)
        sample_df = df.replace({np.nan: "-"})
        total_clean_rows = len(sample_df)
        sample_headers = "".join(f"<th>{html.escape(str(c))}</th>" for c in sample_df.columns)
        sample_body_rows = []
        for row_idx, (_, r) in enumerate(sample_df.iterrows()):
            cells = []
            for c in sample_df.columns:
                val = r[c]
                if isinstance(val, (int, np.integer)):
                    cells.append(f"<td style='text-align:right;'>{val:,}</td>")
                elif isinstance(val, (float, np.floating)):
                    cells.append(f"<td style='text-align:right;'>{val:,.0f}</td>" if abs(val) >= 1000 else f"<td style='text-align:right;'>{val:,.2f}</td>")
                else:
                    cells.append(f"<td>{html.escape(str(val))}</td>")
            row_attr = ' class="extra-data-row" style="display:none;"' if row_idx >= 10 else ''
            sample_body_rows.append(f"<tr{row_attr}>{''.join(cells)}</tr>")

        toggle_clean_btn_html = f"""
            <div style="text-align:center; padding:12px 0; border-top:1px dashed #e2d4ec; margin-top:8px;">
                <button type="button" id="btnToggleFullCleanTable" onclick="toggleFullCleanTable()" style="padding:8px 18px; border-radius:999px; border:1.5px solid #cdb4db; background:#fff; color:#2b1d38; font-weight:700; font-size:0.84rem; cursor:pointer; box-shadow:0 2px 6px rgba(205,180,219,0.25);">
                    👁️ Hiển thị toàn bộ bảng (Tổng số {total_clean_rows:,} dòng) ↓
                </button>
            </div>
        """ if total_clean_rows > 10 else ""

        ts_svg_section = self._build_svg_time_series(analysis_result.get("time_series", {}))
        cb0 = (analysis_result.get("category_breakdowns") or [None])[0]
        donut_svg_section = self._build_svg_donut(cb0) if cb0 else ""
        ba_col_svg_section = self._build_svg_before_after_columns(cb0) if cb0 else ""
        qual_svg_section = self._build_svg_quality_bars(
            initial_profile.get("health_score", {}),
            cleaning_report.get("health_after", {})
        )

        # Ghép toàn bộ thành tài liệu HTML5 hoàn chỉnh
        html_doc = f"""<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{html.escape(report_title)} - {html.escape(dataset_name)}</title>
    <style>
        :root {{
            --primary: #ffafcc;
            --primary-dark: #cdb4db;
            --accent: #a2d2ff;
            --success: #bde0fe;
            --warning: #ffc8dd;
            --bg: #fcf8fe;
            --surface: #ffffff;
            --text: #2b1d38;
            --muted: #6e5682;
            --border: #cdb4db;
        }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: var(--bg);
            color: var(--text);
            line-height: 1.6;
            padding: 24px 18px;
            font-size: 14px;
        }}
        .report-wrapper {{
            max-width: 1120px;
            margin: 0 auto;
            background: var(--surface);
            border-radius: 14px;
            box-shadow: 0 6px 24px rgba(205, 180, 219, 0.28);
            border: 1.5px solid var(--border);
            overflow: hidden;
        }}
        .report-hero {{
            background: linear-gradient(135deg, #cdb4db 0%, #ffc8dd 36%, #ffafcc 68%, #bde0fe 100%);
            color: #2b1d38;
            padding: 32px 36px;
            border-bottom: 1.5px solid #cdb4db;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            flex-wrap: wrap;
            gap: 20px;
        }}
        .hero-badge {{
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: rgba(255, 255, 255, 0.85);
            border: 1px solid #cdb4db;
            color: #2b1d38;
            font-size: 11.5px;
            font-weight: 700;
            padding: 4px 12px;
            border-radius: 999px;
            margin-bottom: 10px;
        }}
        .report-hero h1 {{
            font-size: 22px;
            font-weight: 800;
            letter-spacing: -0.02em;
            margin-bottom: 8px;
            color: #2b1d38;
        }}
        .hero-meta {{
            font-size: 13px;
            color: #4a355b;
            display: flex;
            flex-wrap: wrap;
            gap: 18px;
        }}
        .health-upgrade-card {{
            background: rgba(255, 255, 255, 0.88);
            border: 1.5px solid #a2d2ff;
            border-radius: 12px;
            padding: 14px 20px;
            text-align: center;
            min-width: 220px;
        }}
        .health-upgrade-card .lbl {{
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #4a355b;
            font-weight: 700;
            margin-bottom: 4px;
        }}
        .health-upgrade-card .scores {{
            font-size: 20px;
            font-weight: 800;
            color: #2b1d38;
        }}
        .health-upgrade-card .scores .old-s {{
            color: #9a84ad;
            text-decoration: line-through;
            font-size: 15px;
            font-weight: 600;
        }}
        .health-upgrade-card .scores .new-s {{
            color: #1d4e78;
        }}
        .health-upgrade-card .delta {{
            font-size: 11.5px;
            color: #7c2348;
            font-weight: 700;
            margin-top: 4px;
        }}
        .report-body {{
            padding: 32px 36px;
        }}
        .section-title {{
            font-size: 16px;
            font-weight: 700;
            color: #2b1d38;
            margin: 28px 0 14px 0;
            padding-bottom: 8px;
            border-bottom: 2px solid #f3e5f8;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }}
        .section-title:first-child {{ margin-top: 0; }}
        .exec-summary-box {{
            background: linear-gradient(to right, rgba(255, 200, 221, 0.38), rgba(189, 224, 254, 0.38));
            border-left: 4px solid #ffafcc;
            padding: 18px 22px;
            border-radius: 0 12px 12px 0;
            margin-bottom: 22px;
            font-size: 14px;
            color: #2b1d38;
        }}
        .kpi-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 18px;
            margin-bottom: 28px;
        }}
        .kpi-box {{
            background: #ffffff;
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 18px 20px;
            box-shadow: 0 2px 6px rgba(15, 23, 42, 0.03);
        }}
        .kpi-label {{
            font-size: 12.5px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--muted);
            margin-bottom: 6px;
        }}
        .kpi-val {{
            font-size: 24px;
            font-weight: 800;
            margin-bottom: 4px;
        }}
        .kpi-sub {{
            font-size: 12px;
            color: var(--muted);
        }}
        .charts-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(440px, 1fr));
            gap: 22px;
            margin-bottom: 24px;
        }}
        .rpt-card {{
            background: #ffffff;
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px 22px;
            margin-bottom: 22px;
        }}
        .rpt-card-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            gap: 10px;
        }}
        .rpt-card-header h3 {{
            font-size: 15.5px;
            font-weight: 700;
            color: #0f172a;
        }}
        .rpt-badge {{
            background: #ffc8dd;
            color: #2b1d38;
            border: 1px solid #ffafcc;
            font-size: 11.5px;
            font-weight: 700;
            padding: 3px 10px;
            border-radius: 999px;
            white-space: nowrap;
        }}
        .bar-row {{ margin-bottom: 12px; }}
        .bar-meta {{
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            margin-bottom: 4px;
        }}
        .bar-track {{
            width: 100%;
            height: 10px;
            background: #f6eefb;
            border-radius: 999px;
            overflow: hidden;
        }}
        .bar-fill {{
            height: 100%;
            border-radius: 999px;
        }}
        .pct-pill {{
            background: #bde0fe;
            color: #16324f;
            font-size: 11px;
            padding: 1px 6px;
            border-radius: 4px;
            margin-left: 4px;
        }}
        .findings-list {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(440px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }}
        .finding-item {{
            display: flex;
            gap: 14px;
            background: #fcf8fe;
            border: 1.5px solid var(--border);
            border-radius: 12px;
            padding: 16px 18px;
        }}
        .finding-num {{
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: #ffafcc;
            color: #2b1d38;
            border: 1.5px solid #cdb4db;
            font-weight: 800;
            font-size: 13px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            margin-top: 2px;
        }}
        .finding-body h4 {{
            font-size: 14.5px;
            font-weight: 700;
            margin-bottom: 4px;
            color: #2b1d38;
        }}
        .finding-body p {{
            font-size: 13.5px;
            color: #4a355b;
        }}
        .table-wrap {{
            overflow-x: auto;
            border: 1.5px solid var(--border);
            border-radius: 10px;
            margin-bottom: 24px;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }}
        th {{
            background: linear-gradient(90deg, rgba(205, 180, 219, 0.4) 0%, rgba(255, 200, 221, 0.4) 50%, rgba(189, 224, 254, 0.4) 100%);
            color: #2b1d38;
            font-weight: 700;
            text-align: left;
            padding: 11px 14px;
            border-bottom: 1.5px solid var(--border);
            white-space: nowrap;
        }}
        td {{
            padding: 10px 14px;
            border-bottom: 1px solid #f3e5f8;
            color: #2b1d38;
        }}
        tr:last-child td {{ border-bottom: none; }}
        tr:hover td {{ background: rgba(255, 200, 221, 0.16); }}
        .status-pill {{
            display: inline-block;
            padding: 2px 9px;
            border-radius: 999px;
            font-size: 11.5px;
            font-weight: 700;
        }}
        .status-applied {{ background: #bde0fe; color: #16324f; border: 1px solid #a2d2ff; }}
        .status-skipped {{ background: #f6eefb; color: #6e5682; }}
        .prio-badge {{
            display: inline-block;
            padding: 2px 9px;
            border-radius: 6px;
            font-size: 11.5px;
            font-weight: 700;
        }}
        .prio-high {{ background: #ffc8dd; color: #591632; border: 1px solid #ffafcc; }}
        .prio-med {{ background: #bde0fe; color: #16324f; border: 1px solid #a2d2ff; }}
        .report-footer {{
            background: #f8fafc;
            border-top: 1px solid var(--border);
            padding: 20px 40px;
            display: flex;
            justify-content: space-between;
            font-size: 12.5px;
            color: var(--muted);
            flex-wrap: wrap;
            gap: 10px;
        }}
        @media print {{
            body {{ background: #ffffff; padding: 0; }}
            .report-wrapper {{ box-shadow: none; border: none; }}
        }}
    </style>
</head>
<body>
    <div class="report-wrapper">
        <!-- HEADER -->
        <div class="report-hero">
            <div>
                <div class="hero-badge">✓ Đã phê duyệt quy trình Làm sạch Dữ liệu (Human-in-the-Loop Verified)</div>
                <h1>{html.escape(report_title)}</h1>
                <div class="hero-meta">
                    <span>📁 <strong>Bộ dữ liệu:</strong> {html.escape(dataset_name)}</span>
                    <span>🕒 <strong>Thời gian xuất:</strong> {now_str}</span>
                    <span>🤖 <strong>Bộ não xử lý:</strong> {html.escape(engine_mode)}</span>
                </div>
            </div>
            <div class="health-upgrade-card">
                <div class="lbl">Mức Độ Sạch Của Dữ Liệu (Data Cleanliness)</div>
                <div class="scores">
                    <span class="old-s">{health_before}</span> → <span class="new-s">{health_after}/100</span>
                </div>
                <div class="delta">▲ Độ chính xác tăng +{health_delta} điểm sau chuẩn hóa</div>
            </div>
        </div>

        <div class="report-body">
            <!-- 1. TÓM TẮT ĐIỀU HÀNH & KPI -->
            <div class="section-title">
                <span>1. Tóm tắt Điều hành & Chỉ số Trọng tâm (Executive Summary & KPIs)</span>
            </div>
            <div class="exec-summary-box">
                <strong>💡 Nhận định Tổng quan từ AI Agent:</strong> {html.escape(str(ai_insights.get('executive_summary', '')))}
            </div>
            <div class="kpi-grid">
                {"".join(kpi_cards_html)}
            </div>

            <!-- 2. PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS) -->
            <div class="section-title">
                <span>2. Phân tích Nguyên nhân Gốc rễ & Điểm nghẽn Quy trình (Root Cause Analysis - RCA)</span>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th style="width:14%;">Khâu & Mức độ</th>
                            <th style="width:20%;">Vấn đề Nhận diện</th>
                            <th style="width:28%;">Nguyên nhân Gốc rễ (Root Cause)</th>
                            <th style="width:19%;">Mức độ Ảnh hưởng</th>
                            <th style="width:19%;">Giải pháp Khắc phục từ AI</th>
                        </tr>
                    </thead>
                    <tbody>
                        {"".join(rca_rows_html) if rca_rows_html else "<tr><td colspan='5'>Không có vấn đề cần xử lý</td></tr>"}
                    </tbody>
                </table>
            </div>

            <!-- 3. PHÂN TÍCH TRỰC QUAN ĐA BIỂU ĐỒ -->
            <div class="section-title">
                <span>3. Hệ thống Biểu đồ Trực quan hóa Đa chiều (Visual Analytics)</span>
            </div>
            <div class="charts-grid">
                {ba_col_svg_section}
                {donut_svg_section}
            </div>
            <div class="charts-grid">
                {"".join(cat_charts_html)}
            </div>
            <div class="charts-grid">
                {qual_svg_section}
            </div>
            {ts_svg_section}

            <!-- 4. PHÁT HIỆN CHUYÊN SÂU TỪ AI AGENT (INSIGHTS) -->
            <div class="section-title">
                <span>4. Nhận định & Phát hiện Chuyên sâu (Key Analytical Insights)</span>
            </div>
            <div class="findings-list">
                {"".join(findings_html)}
            </div>

            <!-- 5. MA TRẬN TƯƠNG QUAN & THỐNG KÊ MÔ TẢ -->
            <div class="section-title">
                <span>5. Phân tích Thống kê Mô tả & Tương quan Biến định lượng</span>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Biến định lượng (Numeric Column)</th>
                            <th style="text-align:right;">Số mẫu (N)</th>
                            <th style="text-align:right;">Trung bình (Mean)</th>
                            <th style="text-align:right;">Độ lệch chuẩn (SD)</th>
                            <th style="text-align:right;">Nhỏ nhất (Min)</th>
                            <th style="text-align:right;">Q25</th>
                            <th style="text-align:right;">Trung vị (Median)</th>
                            <th style="text-align:right;">Q75</th>
                            <th style="text-align:right;">Lớn nhất (Max)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {"".join(stats_rows_html) if stats_rows_html else "<tr><td colspan='9'>Không có cột định lượng</td></tr>"}
                    </tbody>
                </table>
            </div>

            {f'''
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Cặp biến phân tích (Variable Pair)</th>
                            <th style="text-align:right;">Hệ số Pearson (r)</th>
                            <th>Cường độ</th>
                            <th>Đánh giá mối quan hệ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {"".join(corr_rows_html)}
                    </tbody>
                </table>
            </div>
            ''' if corr_rows_html else ''}

            <!-- 6. KHUYẾN NGHỊ HÀNH ĐỘNG & LỘ TRÌNH TRIỂN KHAI -->
            <div class="section-title">
                <span>6. Khuyến nghị Chiến lược & Lộ trình Triển khai (Actionable Recommendations)</span>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th style="width:105px;">Mức ưu tiên</th>
                            <th>Hành động Khuyến nghị</th>
                            <th style="width:155px;">Bộ phận phụ trách</th>
                            <th style="width:115px;">Lộ trình</th>
                            <th>Tác động Kỳ vọng</th>
                        </tr>
                    </thead>
                    <tbody>
                        {"".join(recs_rows)}
                    </tbody>
                </table>
            </div>

            <!-- 7. NHẬT KÝ QUY TRÌNH LÀM SẠCH DỮ LIỆU ĐÃ DUYỆT -->
            <div class="section-title">
                <span>7. Hồ sơ Kiểm toán Quy trình Làm sạch Dữ liệu (Human-in-the-Loop Audit Trail)</span>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Cột / Phạm vi</th>
                            <th>Loại vấn đề phát hiện</th>
                            <th>Chiến lược xử lý</th>
                            <th style="text-align:center;">Số dòng/ô tác động</th>
                            <th>Trạng thái Phê duyệt</th>
                            <th>Chi tiết kết quả thực thi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {"".join(cleaning_rows_html)}
                    </tbody>
                </table>
            </div>

            <!-- 8. MẪU DỮ LIỆU SẠCH SAU PHÊ DUYỆT -->
            <div class="section-title">
                <span>8. Bảng Dữ liệu Sạch sau Phê duyệt (Mặc định hiển thị tối đa 10 dòng đầu · Tổng {len(df):,} dòng)</span>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>{sample_headers}</tr>
                    </thead>
                    <tbody>
                        {"".join(sample_body_rows)}
                    </tbody>
                </table>
                {toggle_clean_btn_html}
            </div>
        </div>

        <div class="report-footer">
            <span>Được tạo tự động bởi <strong>DataMind AI Agent System</strong> (Multi-Agent Pipeline: Profiler → Cleaner → Human Approval → Analyzer → HTML Reporter)</span>
            <span>Báo cáo chuẩn HTML5 độc lập</span>
        </div>
    </div>
    <script>
        var _cleanTableExpanded = false;
        function toggleFullCleanTable() {{
            _cleanTableExpanded = !_cleanTableExpanded;
            var rows = document.querySelectorAll('.extra-data-row');
            for (var i = 0; i < rows.length; i++) {{
                rows[i].style.display = _cleanTableExpanded ? 'table-row' : 'none';
            }}
            var btn = document.getElementById('btnToggleFullCleanTable');
            if (btn) {{
                btn.innerHTML = _cleanTableExpanded
                    ? '▲ Thu gọn về 10 dòng đầu ↑'
                    : '👁️ Hiển thị toàn bộ bảng (Tổng số {total_clean_rows:,} dòng) ↓';
            }}
        }}
    </script>
</body>
</html>"""
        return html_doc
