import React, { useState } from "react";
import OrderActions from "./OrderActions";
import OrderModal from "./OrderModal";
const getStatusStyle = (status) => {
    if (status === "delivered") {
        return "text-green bg-green-light-6";
    }
    if (status === "cancelled" || status === "on-hold" || status === "failed") {
        return "text-red bg-red-light-6";
    }
    return "text-yellow bg-yellow-light-4";
};
const SingleOrder = ({ orderItem, smallView }) => {
    const [showDetails, setShowDetails] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const toggleDetails = () => {
        setShowDetails(!showDetails);
    };
    const toggleEdit = () => {
        setShowEdit(!showEdit);
    };
    const toggleModal = (status) => {
        setShowDetails(status);
        setShowEdit(status);
    };
    return (<>
      {!smallView && (<div className="items-center justify-between border-t border-gray-3 py-5 px-7.5 hidden md:flex">
          <div className="min-w-[111px]">
            <p className="text-custom-sm text-red">
              #{orderItem.orderId.slice(-8)}
            </p>
          </div>
          <div className="min-w-[175px]">
            <p className="text-custom-sm text-dark">{orderItem.createdAt}</p>
          </div>

          <div className="min-w-[128px]">
            <p className={`inline-block text-custom-sm py-0.5 px-2.5 rounded-[30px] capitalize ${getStatusStyle(orderItem.status)}`}>
              {orderItem.status}
            </p>
          </div>

          <div className="min-w-[213px]">
            <p className="text-custom-sm text-dark">{orderItem.title}</p>
          </div>

          <div className="min-w-[113px]">
            <p className="text-custom-sm text-dark">{orderItem.total}</p>
          </div>

          <div className="flex gap-5 items-center">
            <OrderActions toggleDetails={toggleDetails} toggleEdit={toggleEdit}/>
          </div>
        </div>)}

      {smallView && (<div className="block md:hidden">
          <div className="py-4.5 px-7.5">
            <div className="">
              <p className="text-custom-sm text-dark">
                <span className="font-bold pr-2"> Order:</span> #
                {orderItem.orderId.slice(-8)}
              </p>
            </div>
            <div className="">
              <p className="text-custom-sm text-dark">
                <span className="font-bold pr-2">Date:</span>{" "}
                {orderItem.createdAt}
              </p>
            </div>

            <div className="">
              <p className="text-custom-sm text-dark">
                <span className="font-bold pr-2">Status:</span>{" "}
                <span className={`inline-block text-custom-sm py-0.5 px-2.5 rounded-[30px] capitalize ${getStatusStyle(orderItem.status)}`}>
                  {orderItem.status}
                </span>
              </p>
            </div>

            <div className="">
              <p className="text-custom-sm text-dark">
                <span className="font-bold pr-2">Title:</span> {orderItem.title}
              </p>
            </div>

            <div className="">
              <p className="text-custom-sm text-dark">
                <span className="font-bold pr-2">Total:</span> {orderItem.total}
              </p>
            </div>

            <div className="">
              <p className="text-custom-sm text-dark flex items-center">
                <span className="font-bold pr-2">Actions:</span>{" "}
                <OrderActions toggleDetails={toggleDetails} toggleEdit={toggleEdit}/>
              </p>
            </div>
          </div>
        </div>)}

      <OrderModal showDetails={showDetails} showEdit={showEdit} toggleModal={toggleModal} order={orderItem}/>
    </>);
};
export default SingleOrder;
