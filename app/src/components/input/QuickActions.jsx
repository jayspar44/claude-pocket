import { StopCircle, CornerDownLeft, FolderOpen, Camera, RotateCcw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ArrowUp, X } from 'lucide-react';

// Row 1: Navigation keys
const navActions = [
  { id: 'tab', label: 'Tab', icon: null, color: 'bg-gray-600 hover:bg-gray-700' },
  { id: 'shift-tab', label: 'Tab', icon: ArrowUp, color: 'bg-gray-600 hover:bg-gray-700' },
  { id: 'escape', label: 'Esc', icon: null, color: 'bg-gray-600 hover:bg-gray-700' },
  { id: 'enter', label: 'Enter', icon: CornerDownLeft, color: 'bg-gray-600 hover:bg-gray-700' },
];

const arrowActions = [
  { id: 'arrow-up', label: '', icon: ChevronUp, color: 'bg-indigo-600 hover:bg-indigo-700' },
  { id: 'arrow-down', label: '', icon: ChevronDown, color: 'bg-indigo-600 hover:bg-indigo-700' },
  { id: 'arrow-left', label: '', icon: ChevronLeft, color: 'bg-indigo-600 hover:bg-indigo-700' },
  { id: 'arrow-right', label: '', icon: ChevronRight, color: 'bg-indigo-600 hover:bg-indigo-700' },
];

// Row 2: Action buttons
const actionButtons = [
  { id: 'commands', label: '/', icon: null, color: 'bg-purple-600 hover:bg-purple-700' },
  { id: 'files', label: 'Files', icon: FolderOpen, color: 'bg-blue-600 hover:bg-blue-700' },
  { id: 'camera', label: 'Image', icon: Camera, color: 'bg-cyan-600 hover:bg-cyan-700' },
];

function QuickActions({ onAction, onOpenCommands, onOpenFiles, onOpenCamera, ctrlActive = false, onCtrlToggle, disabled = false, detectedOptions = [], onDismissOptions }) {
  return (
    <div className="flex flex-col bg-gray-800 border-t border-gray-700">
      {/* Row 0: Detected option buttons (dynamic) */}
      {detectedOptions.length > 0 && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-900/50 border-b border-gray-700">
          <span className="text-xs text-gray-400 shrink-0">Select:</span>
          <div className="flex items-center gap-1.5 flex-1">
            {detectedOptions.map((num) => (
              <button
                key={num}
                onClick={() => onAction(`option-${num}`)}
                disabled={disabled}
                className="flex-1 max-w-16 flex items-center justify-center py-2.5 text-sm font-bold text-white rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label={`Select option ${num}`}
              >
                {num}
              </button>
            ))}
          </div>
          {/* Dismiss button */}
          <button
            onClick={onDismissOptions}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors shrink-0"
            aria-label="Dismiss options"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Row 1: Navigation keys + arrows */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        {/* Nav keys */}
        {navActions.map((action) => (
          <button
            key={action.id}
            onClick={() => onAction(action.id)}
            disabled={disabled}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-bold text-white rounded-md ${action.color} disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap`}
            aria-label={action.label || action.id}
          >
            {action.icon && <action.icon className="w-4 h-4" />}
            {action.label && <span>{action.label}</span>}
          </button>
        ))}

        {/* Separator */}
        <div className="w-px h-7 bg-gray-600 shrink-0" />

        {/* Arrow keys */}
        {arrowActions.map((action) => (
          <button
            key={action.id}
            onClick={() => onAction(action.id)}
            disabled={disabled}
            className={`flex items-center justify-center p-2 text-white rounded ${action.color} disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
            aria-label={action.id.replace('arrow-', '') + ' arrow'}
          >
            <action.icon className="w-4.5 h-4.5" />
          </button>
        ))}
      </div>

      {/* Row 2: Ctrl + actions + Refresh */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        {/* Ctrl modifier */}
        <button
          onClick={onCtrlToggle}
          disabled={disabled}
          className={`flex-1 flex items-center justify-center py-2 text-xs font-bold text-white rounded-md transition-colors whitespace-nowrap ${
            ctrlActive
              ? 'bg-yellow-500 hover:bg-yellow-600 ring-2 ring-yellow-300'
              : 'bg-gray-600 hover:bg-gray-700'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-label="Ctrl modifier"
          aria-pressed={ctrlActive}
        >
          Ctrl
        </button>

        {/* Ctrl+C */}
        <button
          onClick={() => onAction('interrupt')}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-bold text-white rounded-md bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          aria-label="Ctrl+C"
        >
          <StopCircle className="w-4 h-4" />
          <span>Ctrl+C</span>
        </button>

        {/* Action buttons */}
        {actionButtons.map((action) => {
          const handler = action.id === 'commands' ? onOpenCommands
            : action.id === 'files' ? onOpenFiles
            : action.id === 'camera' ? onOpenCamera
            : null;

          return (
            <button
              key={action.id}
              onClick={handler}
              disabled={disabled || !handler}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-bold text-white rounded-md ${action.color} disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap`}
              aria-label={action.label}
            >
              {action.icon && <action.icon className="w-4 h-4" />}
              <span>{action.label}</span>
            </button>
          );
        })}

        {/* Refresh button */}
        <button
          onClick={() => onAction('refresh')}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-bold text-white rounded-md bg-gray-600 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          aria-label="Refresh"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
      </div>
    </div>
  );
}

export default QuickActions;
