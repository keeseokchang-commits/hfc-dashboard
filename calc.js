/* HFC common.css v2.0 — 공통 프레임워크(canonical). 페이지 개별 스타일은 각 html이 뒤에 로드되어 우선 적용됨 */

  :root {
    --bg:#F2F4F7;--surface:#FFFFFF;--surface2:#F7F9FC;
    --border:#E2E8F0;--text:#1A202C;--text2:#4A5568;--text3:#A0AEC0;
    --blue:#2563EB;--blue-lt:#EBF4FF;--green:#059669;--green-lt:#ECFDF5;
    --amber:#D97706;--amber-lt:#FFFBEB;--red:#DC2626;--red-lt:#FEF2F2;
    --teal:#0891B2;--teal-lt:#ECFEFF;
    --nav-h:56px;--radius:12px;--shadow:0 1px 4px rgba(0,0,0,.08);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);min-height:100dvh}
  .app-header{position:sticky;top:0;z-index:100;background:var(--surface);border-bottom:1px solid var(--border);height:52px;display:flex;align-items:center;padding:0 16px;gap:10px}
  .app-logo{font-weight:700;font-size:15px;color:var(--blue);flex:1}
  .app-logo span{color:var(--text3);font-weight:400;font-size:13px;margin-left:4px}
  .btn-icon{width:36px;height:36px;border-radius:8px;border:none;background:var(--surface2);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--text2)}
  .main{padding:14px 14px 80px}
  .card{background:var(--surface);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow);border:1px solid var(--border);margin-bottom:12px}
  .card-title{font-size:13px;font-weight:600;color:var(--text2);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
  .kpi-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
  .kpi{background:var(--surface);border-radius:var(--radius);padding:12px;box-shadow:var(--shadow);border:1px solid var(--border)}
  .kpi-label{font-size:11px;color:var(--text3);margin-bottom:4px}
  .kpi-value{font-size:20px;font-weight:700;color:var(--text)}
  .kpi-sub{font-size:11px;color:var(--text3);margin-top:3px}
  .kpi.blue .kpi-value{color:var(--blue)}
  .kpi.green .kpi-value{color:var(--green)}
  .kpi.red .kpi-value{color:var(--red)}
  .kpi.amber .kpi-value{color:var(--amber)}
  .chart-wrap{position:relative;height:200px}

  /* 업로드 존 */
  .upload-zone{border:2px dashed var(--border);border-radius:var(--radius);padding:28px 16px;text-align:center;cursor:pointer;transition:all .15s;background:var(--surface2)}
  .upload-zone:hover,.upload-zone.drag{border-color:var(--blue);background:var(--blue-lt)}
  .upload-zone-icon{font-size:32px;margin-bottom:8px}
  .upload-zone-title{font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px}
  .upload-zone-sub{font-size:12px;color:var(--text3)}
  .upload-progress{height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin-top:12px;display:none}
  .upload-progress-fill{height:100%;background:var(--blue);border-radius:2px;transition:width .3s}

  /* 월별 비교 테이블 */
  .cf-table{width:100%;border-collapse:collapse}
  .cf-table th{font-size:11px;font-weight:600;color:var(--text3);text-align:right;padding:6px 8px;border-bottom:2px solid var(--border)}
  .cf-table th:first-child{text-align:left}
  .cf-table td{font-size:12px;padding:8px 8px;border-bottom:1px solid var(--border);text-align:right;vertical-align:middle}
  .cf-table td:first-child{text-align:left;font-weight:600}
  .cf-table tr:last-child td{border-bottom:none}
  .cf-table tr:hover td{background:var(--surface2)}
  .gauge-mini{display:flex;align-items:center;gap:6px;justify-content:flex-end}
  .gauge-track{width:60px;height:6px;background:var(--border);border-radius:3px;overflow:hidden;flex-shrink:0}
  .gauge-fill{height:100%;border-radius:3px}
  .gauge-fill.g{background:var(--green)}
  .gauge-fill.a{background:var(--amber)}
  .gauge-fill.r{background:var(--red)}
  .pos{color:var(--green);font-weight:600}
  .neg{color:var(--red);font-weight:600}
  .no-data{color:var(--text3)}
  .badge-cat{font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;display:inline-block}
  .badge-green{background:var(--green-lt);color:var(--green)}
  .badge-blue{background:var(--blue-lt);color:var(--blue)}
  .badge-amber{background:var(--amber-lt);color:var(--amber)}
  .badge-red{background:var(--red-lt);color:var(--red)}

  /* 미분류 패널 */
  .unclass-item{padding:8px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .unclass-item:last-child{border-bottom:none}
  .unclass-desc{font-size:12px;flex:1;min-width:120px}
  .unclass-amt{font-size:12px;font-weight:600;color:var(--red)}
  .cat-select{font-size:12px;border:1px solid var(--border);border-radius:6px;padding:4px 8px;background:var(--surface);color:var(--text);outline:none}

  /* 상세 드릴다운 모달 */
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:300;display:none;align-items:flex-end}
  .modal-overlay.open{display:flex}
  .modal{background:var(--surface);border-radius:16px 16px 0 0;width:100%;max-height:85dvh;overflow-y:auto;padding:20px 16px 32px}
  .modal-title{font-size:15px;font-weight:600;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center}
  .detail-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px}
  .detail-row:last-child{border-bottom:none}
  .detail-label{color:var(--text2)}
  .detail-val{font-weight:500}

  /* 탭바 */
  .tab-bar{position:fixed;bottom:0;left:0;right:0;height:var(--nav-h);background:var(--surface);border-top:1px solid var(--border);display:flex;z-index:100}
  .tab-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:10px;color:var(--text3);cursor:pointer;border:none;background:none;padding:4px 0}
  .tab-item.active{color:var(--blue)}
  .tab-item .tab-icon{font-size:20px}
  .toast{position:fixed;bottom:70px;left:50%;transform:translateX(-50%) translateY(20px);background:#1A202C;color:#fff;padding:10px 20px;border-radius:20px;font-size:13px;opacity:0;transition:all .25s;pointer-events:none;z-index:500;white-space:nowrap}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
  .spinner{width:24px;height:24px;border:3px solid var(--border);border-top-color:var(--blue);border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
  @keyframes spin{to{transform:rotate(360deg)}}
  .empty-state{text-align:center;padding:24px;color:var(--text3);font-size:13px}

  @media(min-width:768px){
    body{display:grid;grid-template-columns:220px 1fr}
    .app-header{grid-column:1/-1}
    .side-nav{background:var(--surface);border-right:1px solid var(--border);padding:20px 12px;display:flex;flex-direction:column;gap:4px;height:calc(100dvh - 52px);position:sticky;top:52px}
    .side-nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;font-size:14px;color:var(--text2);border:none;background:none;width:100%;text-align:left}
    .side-nav-item.active{background:var(--blue-lt);color:var(--blue);font-weight:600}
    .side-nav-item .sn-icon{font-size:18px}
    .tab-bar{display:none}
    .main{max-width:860px;padding:20px 24px 24px}
    .kpi-grid{grid-template-columns:repeat(4,1fr)}
    .modal{border-radius:16px;max-width:560px;margin:auto}
    .modal-overlay{align-items:center;justify-content:center}
  }
  @media(max-width:767px){.side-nav{display:none}}
