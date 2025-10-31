"use client";
import { cn } from "@/lib/utils";
import React, { useState, createContext, useContext, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconMenu2, IconX } from "@tabler/icons-react";

interface Links {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined
);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate: animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as React.ComponentProps<"div">)} />
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();
  const [isPinned, setIsPinned] = React.useState(false);

  const handleMouseEnter = () => {
    if (!isPinned) {
      setOpen(true);
    }
  };

  const handleMouseLeave = () => {
    if (!isPinned) {
      setOpen(false);
    }
  };

  const handleToggleClick = () => {
    setIsPinned(!isPinned);
    setOpen(!open);
  };

  return (
    <>
      <motion.div
        className={cn(
          "h-full px-4 py-6 hidden md:flex md:flex-col bg-black/40 backdrop-blur-xl shrink-0 overflow-hidden fixed left-0 top-0 z-40 shadow-2xl",
          className
        )}
        animate={{
          width: animate ? (open ? "300px" : "0px") : "300px",
          x: animate ? (open ? 0 : -300) : 0,
        }}
        transition={{
          type: "tween",
          ease: "easeInOut",
          duration: 0.3,
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        {children}
      </motion.div>

      {/* Trigger area on the left edge */}
      {!isPinned && (
        <div
          className="hidden md:block fixed left-0 top-0 w-4 h-full z-30"
          onMouseEnter={handleMouseEnter}
        />
      )}

      {/* Sidebar trigger button */}
      <motion.button
        className="hidden md:flex fixed top-4 z-50 items-center justify-center w-9 h-9 rounded-lg bg-white/10 border border-white/20 shadow-md hover:bg-white/15 transition-colors"
        animate={{
          left: animate ? (open ? "316px" : "16px") : "316px",
        }}
        transition={{
          type: "tween",
          ease: "easeInOut",
          duration: 0.3,
        }}
        onClick={handleToggleClick}
        aria-label="Toggle Sidebar"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-foreground"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M9 3v18" />
        </svg>
      </motion.button>
    </>
  );
};

export const MobileSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) => {
  const { open, setOpen } = useSidebar();
  return (
    <>
      <div
        className={cn(
          "h-12 px-4 py-2 flex flex-row md:hidden items-center justify-between bg-transparent w-full"
        )}
        {...props}
      >
        <div className="flex justify-end z-20 w-full">
          <IconMenu2
            className="text-sidebar-foreground hover:text-sidebar-primary transition-colors cursor-pointer"
            onClick={() => setOpen(!open)}
          />
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: "easeInOut",
              }}
              className={cn(
                "fixed h-full w-full inset-0 bg-black/60 backdrop-blur-xl p-6 z-[100] flex flex-col justify-between",
                className
              )}
            >
              <div
                className="absolute right-6 top-6 z-50 text-sidebar-foreground hover:text-sidebar-primary transition-colors cursor-pointer"
                onClick={() => setOpen(!open)}
              >
                <IconX />
              </div>
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export const SidebarLink = ({
  link,
  className,
  ...props
}: {
  link: Links;
  className?: string;
}) => {
  const { open, animate } = useSidebar();
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    setIsActive(window.location.pathname === link.href);
  }, [link.href]);

  return (
      <a
        href={link.href}
        className={cn(
          "flex items-center justify-start gap-4 group/sidebar px-4 py-4 rounded-lg transition-all duration-200",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
          !isActive && "text-sidebar-foreground",
          className
        )}
        {...props}
      >
      <motion.div
        className="shrink-0 flex items-center justify-center"
        animate={{
          width: animate ? (open ? "24px" : "32px") : "24px",
          height: animate ? (open ? "24px" : "32px") : "24px",
        }}
      >
        {link.icon}
      </motion.div>

      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="text-base font-medium whitespace-nowrap overflow-hidden"
      >
        {link.label}
      </motion.span>
    </a>
  );
};

// Spacer element to reserve horizontal space for the fixed desktop sidebar
// so page content sits to the right instead of being covered.
export const SidebarSpacer = ({ className }: { className?: string }) => {
  const { open, animate } = useSidebar();
  return (
    <motion.div
      aria-hidden
      className={cn("hidden md:block shrink-0", className)}
      animate={{ width: animate ? (open ? 300 : 0) : 300 }}
      transition={{ type: "tween", ease: "easeInOut", duration: 0.3 }}
    />
  );
};
