import React, { useState, useEffect } from "react";
const CustomSelect = ({ options }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedOption, setSelectedOption] = useState(options[0]);
    const toggleDropdown = () => {
        setIsOpen((prev) => !prev);
    };
    const handleOptionClick = (option) => {
        setSelectedOption(option);
        toggleDropdown();
    };
    useEffect(() => {
        // closing modal while clicking outside
        function handleClickOutside(event) {
            if (!event.target.closest(".dropdown-content")) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen]);
    return (<div className="dropdown-content custom-select relative w-[145px] sm:w-[200px] shrink-0">
      <div className={`select-selected whitespace-nowrap ${isOpen ? "select-arrow-active" : ""}`} onClick={toggleDropdown}>
        {selectedOption.label}
      </div>
      <div className={`select-items ${isOpen ? "" : "select-hide"}`}>
        {options.slice(1).map((option, index) => (<div key={index} onClick={() => handleOptionClick(option)} className={`select-item ${selectedOption === option ? "same-as-selected" : ""}`}>
            {option.label}
          </div>))}
      </div>
    </div>);
};
export default CustomSelect;
