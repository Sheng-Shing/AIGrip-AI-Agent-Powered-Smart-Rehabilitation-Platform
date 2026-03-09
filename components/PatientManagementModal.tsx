import React, { useState } from 'react';
import { User, Plus, Edit2, Trash2, X, Check, ArrowLeft } from 'lucide-react';
import { Patient } from '../types';

interface PatientManagementModalProps {
    patients: Patient[];
    selectedPatientId?: string;
    onSelect: (patient: Patient, autoAiAnalysis: boolean) => void;
    onUpdate: (patients: Patient[]) => void;
    onClose: () => void;
}

const PatientManagementModal: React.FC<PatientManagementModalProps> = ({
    patients,
    selectedPatientId,
    onSelect,
    onUpdate,
    onClose
}) => {
    const [editingPatient, setEditingPatient] = useState<Partial<Patient> | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [autoAiAnalysis, setAutoAiAnalysis] = useState(true);

    const handleSave = () => {
        if (!editingPatient?.name) {
            alert('請輸入姓名');
            return;
        }

        let newPatients: Patient[];
        if (isAdding) {
            const newPatient: Patient = {
                id: `p_${Date.now()}`,
                name: editingPatient.name || '',
                gender: editingPatient.gender || 'male',
                birthYear: editingPatient.birthYear || new Date().getFullYear(),
            };
            newPatients = [...patients, newPatient];
        } else {
            newPatients = patients.map(p =>
                p.id === editingPatient.id ? (editingPatient as Patient) : p
            );
        }

        onUpdate(newPatients);
        setEditingPatient(null);
        setIsAdding(false);
    };

    const handleDelete = (id: string) => {
        if (!confirm('確定要刪除此患者資料嗎？')) return;
        const newPatients = patients.filter(p => p.id !== id);
        onUpdate(newPatients);
    };

    const startEdit = (patient: Patient) => {
        setEditingPatient({ ...patient });
        setIsAdding(false);
    };

    const startAdd = () => {
        setEditingPatient({
            name: '',
            gender: 'male',
            birthYear: 1970
        });
        setIsAdding(true);
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="bg-zinc-800/50 p-6 border-b border-zinc-700 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        {editingPatient ? (
                            <button
                                onClick={() => setEditingPatient(null)}
                                className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5 text-zinc-400" />
                            </button>
                        ) : (
                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                <User className="w-5 h-5 text-emerald-400" />
                            </div>
                        )}
                        <h2 className="text-xl font-bold text-white">
                            {editingPatient ? (isAdding ? '新增患者資料' : '修改患者資料') : '患者管理'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-700 rounded-lg transition-colors text-zinc-400"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {editingPatient ? (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">患者姓名</label>
                                <input
                                    type="text"
                                    value={editingPatient.name || ''}
                                    onChange={e => setEditingPatient({ ...editingPatient, name: e.target.value })}
                                    placeholder="請輸入姓名"
                                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 outline-none transition-all font-bold"
                                    autoFocus
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">性別</label>
                                    <select
                                        value={editingPatient.gender || 'male'}
                                        onChange={e => setEditingPatient({ ...editingPatient, gender: e.target.value as any })}
                                        className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 outline-none transition-all font-bold"
                                    >
                                        <option value="male">男</option>
                                        <option value="female">女</option>
                                        <option value="other">其他</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">西元出生年</label>
                                    <input
                                        type="number"
                                        value={editingPatient.birthYear || 1970}
                                        onChange={e => setEditingPatient({ ...editingPatient, birthYear: parseInt(e.target.value) })}
                                        className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 outline-none transition-all font-bold"
                                    />
                                </div>
                            </div>

                            <div className="pt-4">
                                <button
                                    onClick={handleSave}
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/20"
                                >
                                    <Check className="w-5 h-5" />
                                    儲存修改
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {patients.length === 0 ? (
                                <div className="text-center py-12 text-zinc-600 italic">
                                    目前尚無患者資料，請點擊下方按鈕新增。
                                </div>
                            ) : (
                                patients.map(patient => (
                                    <div
                                        key={patient.id}
                                        className={`group border-2 rounded-2xl p-4 flex items-center justify-between transition-all hover:scale-[1.01] ${selectedPatientId === patient.id
                                            ? 'border-emerald-500 bg-emerald-500/5'
                                            : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
                                            }`}
                                    >
                                        <div
                                            className="flex-1 cursor-pointer flex items-center gap-4"
                                            onClick={() => onSelect(patient, autoAiAnalysis)}
                                        >
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${selectedPatientId === patient.id ? 'bg-emerald-500 text-zinc-900' : 'bg-zinc-800 text-zinc-400'
                                                }`}>
                                                {patient.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="text-white font-bold">{patient.name}</div>
                                                <div className="text-[10px] text-zinc-500 font-medium">
                                                    {patient.gender === 'male' ? '男' : patient.gender === 'female' ? '女' : '其他'} • {patient.birthYear}年
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => startEdit(patient)}
                                                className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-cyan-400 transition-colors"
                                                title="編輯"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(patient.id)}
                                                className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-rose-500 transition-colors"
                                                title="刪除"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}

                            <button
                                onClick={startAdd}
                                className="w-full mt-4 border-2 border-dashed border-zinc-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 rounded-2xl py-6 flex flex-col items-center justify-center gap-2 group transition-all"
                            >
                                <div className="w-10 h-10 rounded-full bg-zinc-800 group-hover:bg-emerald-500/20 flex items-center justify-center transition-colors">
                                    <Plus className="w-5 h-5 text-zinc-500 group-hover:text-emerald-400" />
                                </div>
                                <span className="text-sm font-bold text-zinc-500 group-hover:text-emerald-400">新增患者資料</span>
                            </button>

                            {/* AI Analysis Toggle */}
                            <div className="mt-6 pt-4 border-t border-zinc-800">
                                <label className="flex items-center justify-between cursor-pointer group">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg transition-colors ${autoAiAnalysis ? 'bg-cyan-500/10' : 'bg-zinc-800'}`}>
                                            <span className="text-lg">{autoAiAnalysis ? '✨' : '👤'}</span>
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-zinc-200">AI 智能數據分析</div>
                                            <div className="text-[10px] text-zinc-500">選擇患者後自動撈取歷史紀錄並生成建議</div>
                                        </div>
                                    </div>
                                    <div
                                        onClick={() => setAutoAiAnalysis(!autoAiAnalysis)}
                                        className={`w-12 h-6 rounded-full p-1 transition-all ${autoAiAnalysis ? 'bg-cyan-600' : 'bg-zinc-800'}`}
                                    >
                                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${autoAiAnalysis ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </div>
                                </label>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PatientManagementModal;
