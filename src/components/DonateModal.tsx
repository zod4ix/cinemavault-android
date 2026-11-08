import React, { useState, useEffect, useRef } from 'react';
import { X, Copy, Check, QrCode, Heart, ShieldCheck, Sparkles, AlertTriangle, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { DONATION_WALLETS, CryptoWallet } from '../types/donation';
import { useLanguage } from '../i18n/LanguageContext';

interface DonateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DonateModal: React.FC<DonateModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  const [selectedWallet, setSelectedWallet] = useState<CryptoWallet>(DONATION_WALLETS[0]);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [copiedMemo, setCopiedMemo] = useState<boolean>(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const tId = setTimeout(() => {
      closeBtnRef.current?.focus({ preventScroll: true });
    }, 80);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      clearTimeout(tId);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2500);
  };

  const handleCopyMemo = (memo: string) => {
    navigator.clipboard.writeText(memo);
    setCopiedMemo(true);
    setTimeout(() => setCopiedMemo(false), 2500);
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div 
        className="relative w-full max-w-2xl bg-gradient-to-b from-[#141b2b] to-[#090d16] border-t sm:border border-amber-500/30 rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-amber-500/10 overflow-hidden flex flex-col max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow Header Border */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-red-500 to-amber-500" />
        
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/20 shrink-0">
              <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-white fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-black text-white tracking-wide">{t('donateHeader')}</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> {t('forOurs')}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400">{t('donateSubtitle')}</p>
            </div>
          </div>
          <button 
            ref={closeBtnRef}
            type="button"
            tabIndex={0}
            onClick={onClose}
            className="p-2 sm:p-2.5 rounded-xl bg-white/5 hover:bg-red-600 text-slate-400 hover:text-white transition-colors tv-btn-focus focus:outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 custom-scrollbar">
          {/* Mission Notice */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 text-xs text-amber-200/90 leading-relaxed">
            <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>{t('freeCinemaNotice')}</div>
          </div>

          {/* Currency Selector Grid */}
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
              <span>{t('selectCrypto')}</span>
              <span className="text-[11px] text-amber-400 lowercase font-medium">{selectedWallet.name}</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DONATION_WALLETS.map((wallet) => {
                const isSelected = selectedWallet.symbol === wallet.symbol && selectedWallet.network === wallet.network;
                return (
                  <button
                    key={`${wallet.symbol}-${wallet.network || ''}`}
                    type="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedWallet(wallet);
                      setCopiedAddress(null);
                      setCopiedMemo(false);
                    }}
                    className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all tv-btn-focus focus:outline-none ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500 shadow-md shadow-amber-500/15 scale-[1.02]'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-extrabold text-white text-sm">{wallet.symbol}</span>
                      {isSelected ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400 animate-pulse" />
                      ) : (
                        <QrCode className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 truncate w-full">{wallet.network || wallet.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ACTIVE WALLET & BIG SCANNABLE QR CODE CONTAINER */}
          <div className="p-4 sm:p-5 rounded-2xl bg-black/60 border border-white/15 space-y-4">
            {/* Header of selected wallet */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  {selectedWallet.name} ({selectedWallet.symbol})
                </h4>
                <p className="text-xs text-amber-400 font-semibold">{t('network')}: {selectedWallet.network}</p>
              </div>

              {selectedWallet.badge && (
                <span className="text-[10px] sm:text-xs px-2.5 py-1 rounded-md font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {selectedWallet.badge}
                </span>
              )}
            </div>

            {/* Centered Large QR Code */}
            <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-900/90 border border-white/10 space-y-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                <Smartphone className="w-4 h-4 text-amber-400" />
                <span>{t('scanQrHelp')}</span>
              </div>

              {/* Crisp High-Contrast QR Code Card */}
              <div className="p-4 bg-white rounded-2xl shadow-2xl flex flex-col items-center justify-center border-4 border-amber-500/20">
                <QRCodeSVG
                  value={selectedWallet.address}
                  size={190}
                  level="H"
                  includeMargin={false}
                />
                <div className="mt-2 text-[11px] font-black tracking-widest text-slate-900 uppercase">
                  {selectedWallet.symbol} • {selectedWallet.network?.split(' ')[0] || ''}
                </div>
              </div>
            </div>

            {/* Address Row with Copy */}
            <div className="space-y-1">
              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>{t('addressForTransfer')}</span>
                <span className="text-[10px] text-slate-500">{t('clickToCopy')}</span>
              </div>

              <div 
                onClick={() => handleCopyAddress(selectedWallet.address)}
                className="p-3 rounded-xl bg-slate-900 border border-white/15 hover:border-amber-500/60 cursor-pointer flex items-center justify-between gap-2 group transition-all"
              >
                <span className="font-mono text-xs sm:text-sm text-slate-200 break-all select-all font-semibold">
                  {selectedWallet.address}
                </span>
                <button
                  type="button"
                  className="shrink-0 p-2 rounded-lg bg-white/5 group-hover:bg-amber-500/20 text-slate-300 group-hover:text-amber-400 transition-colors"
                >
                  {copiedAddress === selectedWallet.address ? (
                    <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* SPECIAL PROMINENT MEMO FIELD FOR XRP */}
            {selectedWallet.memo && (
              <div className="p-3.5 rounded-xl bg-red-950/40 border-2 border-red-500/60 space-y-2">
                <div className="flex items-center gap-2 text-xs font-black text-red-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{t('memoRequired')}</span>
                </div>
                
                <div 
                  onClick={() => handleCopyMemo(selectedWallet.memo!)}
                  className="p-3 rounded-xl bg-black/80 border border-red-500/40 hover:border-red-400 cursor-pointer flex items-center justify-between gap-3 group"
                >
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold">MEMO / Destination Tag:</span>
                    <span className="font-mono text-base sm:text-lg font-black text-amber-400 select-all tracking-wider">
                      {selectedWallet.memo}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="p-2 rounded-lg bg-red-500/20 group-hover:bg-red-500/30 text-amber-300 transition-colors flex items-center gap-1.5 text-xs font-bold"
                  >
                    {copiedMemo ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                        <span className="text-emerald-400">{t('memoCopied')}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>{t('copyMemo')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Primary Action Button */}
            <button
              type="button"
              tabIndex={0}
              onClick={() => handleCopyAddress(selectedWallet.address)}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 transition-all active:scale-[0.98] tv-btn-focus focus:outline-none"
            >
              {copiedAddress === selectedWallet.address ? (
                <>
                  <Check className="w-5 h-5 text-slate-950 stroke-[3]" />
                  <span>{t('addressCopied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  <span>{t('copyAddress')} ({selectedWallet.symbol})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-black/50 border-t border-white/10 text-center text-xs text-slate-400">
          {t('donateFooter')}
        </div>
      </div>
    </div>
  );
};
