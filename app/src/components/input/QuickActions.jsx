import { StopCircle, CornerDownLeft, Slash, FolderOpen, Camera, RotateCcw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const actions = [
  { id: 'tab', label: 'Tab', icon: null, color: 'bg-gray-600 hover:bg-gray-700' },
  { id: 'shift-tab', label: '⇧Tab', icon: null, color: 'bg-gray-600 hover:bg-gray-700' },
  { id: 'escape', label: 'Esc', icon: null, color: 'bg-gray-600 hover:bg-gray-700' },
  { id: 'enter', label: 'Enter', icon: CornerDownLeft, color: 'bg-gray-600 hover:bg-gray-700' },
];

const arrowActions = [
  { id: 'arrow-up', label: '', icon: ChevronUp, color: 'bg-indigo-600 hover:bg-indigo-700' },
  { id: 'arrow-down', label: '', icon: ChevronDown, color: 'bg-indigo-600 hover:bg-indigo-700' },
  { id: 'arrow-left', label: '', icon: ChevronLeft, color: 'bg-indigo-600 hover:bg-indigo-700' },
  { id: 'arrow-right', label: '', icon: ChevronRight, color: 'bg-indigo-600 hover:bg-indigo-700' },
];

const extraActions = [
  { id: 'commands', label: '/', icon: Slash, color: 'bg-purple-600 hover:bg-purple-700' },
  { id: 'files', label: 'Files', icon: FolderOpen, color: 'bg-blue-600 hover:bg-blue-700' },
  { id: 'camera', label: 'Image', icon: Camera, color: 'bg-cyan-600 hover:bg-cyan-700' },
];

function QuickActions({ onAction, onOpenCommands, onOpenFiles, onOpenCamera, ctrlActive = false, onCtrlToggle, disabled = false }) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-800 border-t border-gray-700 overflow-x-auto no-scrollbar">
      {/* Primary quick actions */}
      <div className="flex items-center gap-1">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => onAction(action.id)}
            disabled={disabled}
            className={`flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white rounded-md ${action.color} disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap`}
            aria-label={action.label || action.id}
          >
            {action.icon && <action.icon className="w-3.5 h-3.5" />}
            {action.label && <span>{action.label}</span>}
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-gray-600 mx-0.5 shrink-0" />

      {/* Arrow keys */}
      <div className="flex items-center gap-1.5">
        {arrowActions.map((action) => (
          <button
            key={action.id}
            onClick={() => onAction(action.id)}
            disabled={disabled}
            className={`flex items-center justify-center p-1.5 text-white rounded ${action.color} disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
            aria-label={action.id.replace('arrow-', '') + ' arrow'}
          >
            <action.icon className="w-4 h-4" />
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-gray-600 mx-0.5 shrink-0" />

      {/* Ctrl modifier + Ctrl+C */}
      <div className="flex items-center gap-1">
        <button
          onClick={onCtrlToggle}
          disabled={disabled}
          className={`flex items-center justify-center px-2.5 py-1.5 text-xs font-medium text-white rounded-md transition-colors whitespace-nowrap ${
            ctrlActive
              ? 'bg-yellow-500 hover:bg-yellow-600 ring-2 ring-yellow-300'
              : 'bg-gray-600 hover:bg-gray-700'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-label="Ctrl modifier"
          aria-pressed={ctrlActive}
        >
          Ctrl
        </button>
        <button
          onClick={() => onAction('interrupt')}
          disabled={disabled}
          className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white rounded-md bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          aria-label="Ctrl+C"
        >
          <StopCircle className="w-3.5 h-3.5" />
          <span>Ctrl+C</span>
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-gray-600 mx-0.5 shrink-0" />

      {/* Extra actions */}
      <div className="flex items-center gap-1">
        {extraActions.map((action) => {
          const handler = action.id === 'commands' ? onOpenCommands
            : action.id === 'files' ? onOpenFiles
            : action.id === 'camera' ? onOpenCamera
            : null;

          return (
            <button
              key={action.id}
              onClick={handler}
              disabled={disabled || !handler}
              className={`flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white rounded-md ${action.color} disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap`}
              aria-label={action.label}
            >
              {action.icon && <action.icon className="w-3.5 h-3.5" />}
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>

      {/* Spacer to push Clear to the right */}
      <div className="flex-1" />

      {/* Clear button on the right */}
      <button
        onClick={() => onAction('clear')}
        disabled={disabled}
        className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white rounded-md bg-gray-600 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
        aria-label="Clear"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>Clear</span>
      </button>
    </div>
  );
}

export default QuickActions;
