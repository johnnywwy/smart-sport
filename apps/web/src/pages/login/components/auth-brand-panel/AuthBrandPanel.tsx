import "./AuthBrandPanel.css";
export function AuthBrandPanel() {
  return (
    <section className="auth-brand" aria-label="智慧体育云品牌介绍">
      <div className="auth-logo">
        <span aria-hidden="true">体</span>
        智慧体育云
      </div>
      <div role="img" aria-label="运动场跑道示意图" className="auth-track">
        <div>
          <div>
            <div>
              <div className="auth-track-field">
                <i />
                <span />
                <i />
              </div>
            </div>
          </div>
        </div>
      </div>
      <h1>学校体育管理平台</h1>
    </section>
  );
}
