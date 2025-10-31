'use client'

import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'

interface TokenOption {
  value: string
  label: string
  balance?: number
  symbol?: string
}

interface TokenDropdownProps {
  options: TokenOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  loading?: boolean
  className?: string
}

export function TokenDropdown({ 
  options, 
  value, 
  onChange, 
  placeholder = "Select an option...", 
  loading = false,
  className 
}: TokenDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOption = options.find(option => option.value === value)

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    setIsOpen(false)
  }

  if (loading) {
    return (
      <div className={cn(
        "w-full px-4 py-2.5 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 text-white/60 text-sm",
        className
      )}>
        Loading tokens...
      </div>
    )
  }

  if (options.length === 0) {
    return (
      <div className={cn(
        "w-full px-4 py-2.5 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 text-white/60 text-sm",
        className
      )}>
        No tokens found. Create a token in the wallet tab first.
      </div>
    )
  }

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full px-4 py-2.5 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-[#1DB954]/50 focus:border-[#1DB954] text-white focus:outline-none text-sm transition-all flex items-center justify-between",
          isOpen && "border-[#1DB954]"
        )}
      >
        <span className={cn(
          selectedOption ? "text-white" : "text-white/60"
        )}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-white/60" />
        </motion.div>
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-2 rounded-xl bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden"
          >
            <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {options.map((option, index) => (
                <motion.button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.1, delay: index * 0.02 }}
                  className={cn(
                    "w-full px-4 py-3 text-left text-sm transition-all flex items-center justify-between hover:bg-white/5",
                    value === option.value && "bg-[#1DB954]/10 text-[#1DB954]"
                  )}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{option.label}</span>
                    {option.balance !== undefined && (
                      <span className="text-xs text-white/60">
                        Balance: {option.balance} {option.symbol}
                      </span>
                    )}
                  </div>
                  {value === option.value && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.1 }}
                    >
                      <Check className="w-4 h-4 text-[#1DB954]" />
                    </motion.div>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
