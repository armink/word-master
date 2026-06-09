import { useState } from 'react'

export default function VersionTag() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* 版本小标签 */}
      <div className="flex justify-center mt-2">
        <button
          onClick={() => setOpen(true)}
          className="text-[10px] text-gray-300 hover:text-gray-400 transition-colors leading-none py-1"
          title="版本信息"
        >
          v{__VERSION__} · {__GIT_SHA__}
        </button>
      </div>

      {/* 点击后弹出底部面板 */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-t-2xl px-6 pt-5 pb-8 w-full max-w-md shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-8 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            <h3 className="text-sm font-semibold text-gray-800 mb-4 text-center">版本信息</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">版本号</span>
                <span className="text-gray-800 font-mono">v{__VERSION__}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">构建日期</span>
                <span className="text-gray-800 font-mono">{__BUILD_DATE__}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Git 提交</span>
                <span className="text-gray-800 font-mono text-xs">{__GIT_SHA__}</span>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="mt-5 w-full py-2.5 text-sm text-gray-600 bg-gray-100 rounded-xl active:bg-gray-200 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </>
  )
}
