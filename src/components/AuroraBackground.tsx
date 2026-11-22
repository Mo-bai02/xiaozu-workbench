/**
 * 登录 / 选组页的动态背景。
 *
 * 用几张模糊的大色块缓慢漂移，再叠一层很淡的斜向流光：
 * - 只动 transform 和 opacity，交给合成器，不掉帧
 * - 元素少（4 个色块 + 1 层流光），手机上也不会明显费电
 * - 系统开了「减少动态效果」时全部静止
 */
export function AuroraBackground() {
  return (
    <div className="aurora" aria-hidden="true">
      <span className="aurora-blob aurora-1" />
      <span className="aurora-blob aurora-2" />
      <span className="aurora-blob aurora-3" />
      <span className="aurora-blob aurora-4" />
      <span className="aurora-sheen" />
    </div>
  );
}
